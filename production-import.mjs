import { messages } from './public/i18n.js';
import { readSpreadsheet, writeSpreadsheet } from './spreadsheet.mjs';
import { importDiagnostic } from './import-messages.mjs';
import { matchingInterval } from './line-production.mjs';
import {
  modelOf,
  productionKey,
  sameProduction,
  orderedStationRows,
  stationHasOutput,
} from './public/production-models.js';

const normalized = (value) =>
  String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_\-\/]+/g, '');
const blank = (value) => value == null || String(value).trim() === '';
const aliases = {
  rowId: ['rowid', 'mappingid', 'id', '配置id', '配置編號', '站點id'],
  line: ['line', 'productionline'],
  model: ['model', 'productmodel', '機種', '型號', 'รุ่น'],
  job: ['job', 'role'],
  station: ['station'],
  slot: ['timeslot', 'slot', 'slotid', 'starttime', 'start'],
  end: ['endtime', 'end'],
  actual: ['actual', 'output'],
  target: ['target', 'plannedoutput'],
  issue: ['issue', 'abnormality'],
  date: ['date', 'reportdate'],
  shift: ['shift'],
};
for (const dictionary of Object.values(messages)) {
  for (const [field, key] of Object.entries({
    line: 'line',
    job: 'job',
    station: 'station',
    slot: 'timeSlot',
    end: 'end',
    actual: 'actual',
    target: 'target',
    issue: 'issue',
    date: 'reportDate',
    shift: 'shift',
  }))
    aliases[field].push(dictionary[key]);
  aliases.slot.push(dictionary.start);
}
const fieldFor = new Map(
  Object.entries(aliases).flatMap(([field, names]) =>
    names.filter(Boolean).map((name) => [normalized(name), field]),
  ),
);

function templateRows(config, shift, date, defaults, records) {
  const rows = [
    [
      'Row ID',
      'Line',
      'Job',
      'Station',
      'Time slot',
      'Actual',
      'Issue',
      'Date',
      'Shift',
      'Target',
      'Model',
    ],
  ];
  const saved = new Map(records.map((record) => [record.rowId, record]));
  // A template for a historical date must use the same model/station/interval
  // identities the preview resolves, including saved retired mappings.
  const mappings = new Map(
    config.rows
      .filter((row) => row.active)
      .map((row) => [row.id, saved.get(row.id)?.rowSnapshot || row]),
  );
  for (const record of records)
    if (record.rowSnapshot) mappings.set(record.rowId, record.rowSnapshot);
  for (const row of orderedStationRows(config, [...mappings.values()])) {
    if (!stationHasOutput(row, config)) continue;
    for (const slot of saved.get(row.id)?.slots ||
      defaults[row.id]?.slots ||
      config.schedules[shift].filter((slot) => slot.kind === 'production'))
      rows.push([
        row.id,
        row.line,
        row.job,
        row.station,
        `${slot.start}-${slot.end}`,
        '',
        '',
        date,
        shift,
        '',
        modelOf(row),
      ]);
  }
  return rows;
}

export function importTemplate(config, shift, date = '', defaults = {}, records = []) {
  if (shift !== 'all')
    return writeSpreadsheet(templateRows(config, shift, date, defaults, records));
  const day = templateRows(
    config,
    'day',
    date,
    defaults.day || {},
    records.filter((record) => record.shift === 'day'),
  );
  const night = templateRows(
    config,
    'night',
    date,
    defaults.night || {},
    records.filter((record) => record.shift === 'night'),
  );
  return writeSpreadsheet([...day, ...night.slice(1)]);
}

function findSlot(raw, slots) {
  const value = String(raw ?? '')
    .trim()
    .replace(/[–—−]/g, '-');
  const byId = slots.find((slot) => slot.id === value);
  if (byId) return byId;
  const range = value.match(/^(\d{1,2}):(\d{2})(?::00)?\s*-\s*(\d{1,2}):(\d{2})(?::00)?$/);
  if (range) {
    const start = `${range[1].padStart(2, '0')}:${range[2]}`,
      end = `${range[3].padStart(2, '0')}:${range[4]}`;
    return slots.find((slot) => slot.start === start && slot.end === end);
  }
  const start = value.match(/^(\d{1,2}):(\d{2})(?::00)?$/);
  if (start) return slots.find((slot) => slot.start === `${start[1].padStart(2, '0')}:${start[2]}`);
  return null;
}

/**
 * Resolve explicit stable row IDs, otherwise an unambiguous line/job/station
 * intersection. Blank cells mean "leave saved data alone", never "clear it".
 * Preview errors name source rows and columns; a preview with errors cannot apply.
 */
export function previewImport(
  fileName,
  base64,
  config,
  date,
  shift,
  savedRecords = [],
  language = 'en',
  defaults = {},
  dayMatrix = null,
) {
  if (shift === 'all') {
    const matrix = readSpreadsheet(fileName, base64);
    const parts = ['day', 'night'].map((shift) => ({
      shift,
      result: previewImport(
        fileName,
        base64,
        config,
        date,
        shift,
        savedRecords.filter((record) => record.shift === shift),
        language,
        defaults[shift] || {},
        matrix,
      ),
    }));
    const rows = parts.flatMap(({ shift, result }) =>
      result.rows.map((row) => ({ ...row, shift })),
    );
    const errors = [
      ...new Map(
        parts
          .flatMap(({ result }) => result.errors)
          .map((error) => [JSON.stringify([error.row, error.column, error.code]), error]),
      ).values(),
    ];
    if (!rows.length && !errors.length)
      errors.push({
        row: 1,
        column: '',
        code: 'noValues',
        message: importDiagnostic(language, 'noValues'),
      });
    return {
      rows,
      errors,
      summary: {
        records: rows.length,
        cells: parts.reduce((sum, { result }) => sum + result.summary.cells, 0),
      },
    };
  }
  const matrix = dayMatrix || readSpreadsheet(fileName, base64),
    errors = [],
    records = new Map();
  const diagnostic = (row, column, code, params = {}) => ({
    row,
    column,
    code,
    params,
    message: importDiagnostic(language, code, params),
  });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => !blank(cell?.value)));
  if (headerIndex < 0)
    return { rows: [], errors: [diagnostic(1, '', 'empty')], summary: { records: 0, cells: 0 } };
  const columns = {};
  matrix[headerIndex].forEach((cell, index) => {
    const field = fieldFor.get(normalized(cell?.value));
    if (field) {
      if (columns[field] != null)
        errors.push(diagnostic(headerIndex + 1, field, 'duplicateHeader'));
      columns[field] = index;
    }
  });
  for (const field of ['slot'])
    if (columns[field] == null) errors.push(diagnostic(headerIndex + 1, field, 'missingSlot'));
  if (dayMatrix && columns.shift == null)
    errors.push(diagnostic(headerIndex + 1, 'shift', 'missingShift'));
  if (columns.rowId == null && columns.line == null)
    errors.push(diagnostic(headerIndex + 1, 'line', 'missingMapping'));
  if (columns.actual == null && columns.issue == null && columns.target == null)
    errors.push(diagnostic(headerIndex + 1, 'actual', 'missingValues'));
  if (errors.length) return { rows: [], errors, summary: { records: 0, cells: 0 } };
  const schedule = config.schedules[shift].filter((slot) => slot.kind === 'production');
  const savedById = new Map(savedRecords.map((record) => [record.rowId, record]));
  // Existing records use their original mapping/slot definitions. An archived or
  // renamed station can still receive a correction to its historical actuals.
  const mappings = new Map(
    config.rows
      .filter((row) => row.active)
      .map((row) => [row.id, savedById.get(row.id)?.rowSnapshot || row]),
  );
  for (const record of savedRecords)
    if (record.rowSnapshot) mappings.set(record.rowId, record.rowSnapshot);
  const shiftNames = new Set(
    [shift, ...Object.values(messages).map((dictionary) => dictionary[shift])].map(normalized),
  );
  let cells = 0;
  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const source = matrix[index],
      value = (field) => source[columns[field]]?.value ?? '';
    const rowNumber = source.sourceRow || index + 1;
    if (blank(value('actual')) && blank(value('issue')) && blank(value('target'))) continue;
    const error = (column, code, params = {}) =>
      errors.push(diagnostic(rowNumber, column, code, params));
    if (dayMatrix) {
      const selectedShift = ['day', 'night'].find((shift) =>
        [shift, ...Object.values(messages).map((dictionary) => dictionary[shift])]
          .map(normalized)
          .includes(normalized(value('shift'))),
      );
      if (!selectedShift) {
        error('shift', 'missingShift');
        continue;
      }
      if (selectedShift !== shift) continue;
    }
    if (columns.date != null && !blank(value('date')) && String(value('date')).trim() !== date) {
      error('date', 'dateMismatch', { date });
      continue;
    }
    if (
      columns.shift != null &&
      !blank(value('shift')) &&
      !shiftNames.has(normalized(value('shift')))
    ) {
      error('shift', 'shiftMismatch');
      continue;
    }
    let matches = [...mappings.values()];
    if (!blank(value('rowId')))
      matches = /^\d+$/.test(String(value('rowId')).trim())
        ? matches.filter((row) => row.id === Number(value('rowId')))
        : [];
    for (const field of ['line', 'model', 'job', 'station'])
      if (!blank(value(field)))
        matches = matches.filter(
          (row) =>
            normalized(field === 'model' ? modelOf(row) : row[field]) === normalized(value(field)),
        );
    if (matches.length !== 1) {
      error('rowId', matches.length ? 'ambiguous' : 'unknownMapping');
      continue;
    }
    const row = matches[0],
      savedSlots = savedById.get(row.id)?.slots || defaults[row.id]?.slots || [],
      slots = [
        ...savedSlots,
        ...schedule.filter((slot) => !savedSlots.some((saved) => saved.id === slot.id)),
      ];
    if (!stationHasOutput(row, config)) {
      error('rowId', 'noOutput');
      continue;
    }
    const slot = findSlot(
      !blank(value('end')) ? `${value('slot')}-${value('end')}` : value('slot'),
      slots,
    );
    if (!slot) {
      error('slot', 'unknownSlot');
      continue;
    }
    const change = { slotId: slot.id, start: slot.start, end: slot.end, sourceRow: rowNumber };
    let valid = true;
    for (const field of ['target', 'actual', 'issue']) {
      if (blank(value(field))) continue;
      if (source[columns[field]]?.formula) {
        error(field, 'formula');
        valid = false;
        continue;
      }
      if (field !== 'issue') {
        const actual = Number(value(field));
        if (
          !/^\d+(?:\.0+)?$/.test(String(value(field)).trim()) ||
          !Number.isSafeInteger(actual) ||
          actual < 0 ||
          actual > 99999999
        ) {
          error(field, field === 'target' ? 'invalidTarget' : 'invalidActual');
          valid = false;
        } else change[field] = actual;
      } else if (String(value(field)).length > 2000) {
        error(field, 'issueTooLong');
        valid = false;
      } else change.issue = String(value(field)).trim();
    }
    if (!valid) continue;
    if (!records.has(row.id))
      records.set(row.id, {
        rowId: row.id,
        line: row.line,
        model: modelOf(row),
        job: row.job,
        station: row.station,
        changes: [],
      });
    const record = records.get(row.id),
      existing = record.changes.find((change) => change.slotId === slot.id);
    if (existing) {
      if (
        Object.keys(change).some(
          (key) => ['target', 'actual', 'issue'].includes(key) && Object.hasOwn(existing, key),
        )
      ) {
        error('slot', 'duplicateCell');
        continue;
      }
      Object.assign(existing, change);
    } else record.changes.push(change);
    cells += Number(Object.hasOwn(change, 'actual')) + Number(Object.hasOwn(change, 'issue'));
  }
  // Each worksheet row addresses one station; differing station counts are valid.
  const rows = [...records.values()];
  cells = rows.reduce(
    (sum, row) =>
      sum +
      row.changes.reduce(
        (sum, change) =>
          sum +
          ['target', 'actual', 'issue'].filter((field) => Object.hasOwn(change, field)).length,
        0,
      ),
    0,
  );
  if (!rows.length && !errors.length && !dayMatrix) errors.push(diagnostic(1, '', 'noValues'));
  return { rows, errors, summary: { records: rows.length, cells } };
}
