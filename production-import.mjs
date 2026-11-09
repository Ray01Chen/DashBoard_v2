import { reportSchedule } from './public/production-schedules.js';
import { messages } from './public/i18n.js';
import { readSpreadsheet, writeSpreadsheet } from './spreadsheet.mjs';
import { importDiagnostic } from './import-messages.mjs';
import {
  modelOf,
  productionKey,
  productionUnits,
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

// Keep workbook fields together: scope, station identity, interval, then editable values.
const templateColumns = [
  ['date', 'Date', 14],
  ['shift', 'Shift', 12],
  ['line', 'Line', 18],
  ['model', 'Model', 40],
  ['job', 'Job', 18],
  ['station', 'Station', 20],
  ['interval', 'Time slot', 18],
  ['target', 'Target', 12],
  ['actual', 'Actual', 12],
  ['issue', 'Issue', 45],
  ['rowId', 'Row ID', 10],
];

/** Group each line/model and station in configured order, keeping day/night adjacent.
 * Source row numbers remain on diagnostics; sorting affects only the display plan. */
function orderedImportRows(config, rows) {
  const unitRank = new Map(
    [...new Set([...productionUnits(config), ...rows].map(productionKey))].map((key, index) => [
      key,
      index,
    ]),
  );
  const stationRank = new Map(config.rows.map((row, index) => [row.id, index]));
  return [...rows].sort(
    (a, b) =>
      (unitRank.get(productionKey(a)) ?? Number.MAX_SAFE_INTEGER) -
        (unitRank.get(productionKey(b)) ?? Number.MAX_SAFE_INTEGER) ||
      (stationRank.get(a.rowId) ?? Number.MAX_SAFE_INTEGER) -
        (stationRank.get(b.rowId) ?? Number.MAX_SAFE_INTEGER) ||
      a.rowId - b.rowId ||
      (a.shift === 'night' ? 1 : 0) - (b.shift === 'night' ? 1 : 0),
  );
}

function templateEntries(config, shift, date, defaults, records) {
  const entries = [];
  const saved = new Map(records.map((record) => [record.rowId, record]));
  // Historical templates use captured station and interval identities so renamed
  // or retired stations still round-trip through preview and version checks.
  const mappings = new Map(
    config.rows
      .filter((row) => row.active)
      .map((row) => [row.id, saved.get(row.id)?.rowSnapshot || row]),
  );
  for (const record of records)
    if (record.rowSnapshot) mappings.set(record.rowId, record.rowSnapshot);
  for (const row of mappings.values()) {
    if (!stationHasOutput(row, config)) continue;
    const savedSlots = saved.get(row.id)?.slots || defaults[row.id]?.slots || [];
    const slots = reportSchedule(config, row.line, shift, date, savedSlots);
    for (const slot of slots)
      entries.push({
        rowId: row.id,
        line: row.line,
        model: modelOf(row),
        job: row.job,
        station: row.station,
        interval: `${slot.start}-${slot.end}`,
        date,
        shift,
        target: '',
        actual: '',
        issue: '',
      });
  }
  return entries;
}

export function importTemplate(config, shift, date = '', defaults = {}, records = []) {
  const shifts = shift === 'all' ? ['day', 'night'] : [shift];
  const entries = orderedImportRows(
    config,
    shifts.flatMap((workShift) =>
      templateEntries(
        config,
        workShift,
        date,
        shift === 'all' ? defaults[workShift] || {} : defaults,
        records.filter((record) => shift !== 'all' || record.shift === workShift),
      ),
    ),
  );
  return writeSpreadsheet(
    [
      templateColumns.map(([, label]) => label),
      ...entries.map((entry) => templateColumns.map(([key]) => entry[key])),
    ],
    {
      widths: templateColumns.map(([, , width]) => width),
      inputColumns: templateColumns.flatMap(([key], index) =>
        ['target', 'actual', 'issue'].includes(key) ? [index] : [],
      ),
      freezeColumns: templateColumns.findIndex(([key]) => key === 'interval'),
    },
  );
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
  if (start)
    return slots.find((slot) => slot.start === `${start[1].padStart(2, '0')}:${start[2]}`);
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
    const rows = orderedImportRows(
      config,
      parts.flatMap(({ shift, result }) => result.rows.map((row) => ({ ...row, shift }))),
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
    return {
      rows: [],
      errors: [diagnostic(1, '', 'empty')],
      summary: { records: 0, cells: 0 },
    };
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
    if (
      columns.date != null &&
      !blank(value('date')) &&
      String(value('date')).trim() !== date
    ) {
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
            normalized(field === 'model' ? modelOf(row) : row[field]) ===
            normalized(value(field)),
        );
    if (matches.length !== 1) {
      error('rowId', matches.length ? 'ambiguous' : 'unknownMapping');
      continue;
    }
    const row = matches[0],
      savedSlots = savedById.get(row.id)?.slots || defaults[row.id]?.slots || [],
      slots = reportSchedule(config, row.line, shift, date, savedSlots);
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
    const change = {
      slotId: slot.id,
      start: slot.start,
      end: slot.end,
      sourceRow: rowNumber,
    };
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
  }
  // Each worksheet row addresses one station; differing station counts are valid.
  const rows = orderedImportRows(config, [...records.values()]);
  for (const row of rows) {
    // Use captured interval order, including overnight and retired intervals;
    // sorting clock strings would incorrectly move midnight before the evening.
    const captured = savedById.get(row.rowId)?.slots || defaults[row.rowId]?.slots || [];
    const slots = reportSchedule(config, mappings.get(row.rowId)?.line, shift, date, captured);
    const intervalRank = new Map(slots.map((slot, index) => [slot.id, index]));
    row.changes.sort((a, b) => intervalRank.get(a.slotId) - intervalRank.get(b.slotId));
  }
  const cells = rows.reduce(
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
