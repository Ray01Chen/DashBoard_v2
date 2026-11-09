import { inflateRawSync, crc32 } from 'node:zlib';
import path from 'node:path';

const maximumFileBytes = 8 * 1024 * 1024;
const maximumExpandedBytes = 32 * 1024 * 1024;
const maximumRows = 20000;
const maximumColumns = 100;

function invalid(message) {
  const error = new Error(message);
  Object.assign(error, {
    status: 400,
    code: 'errImport',
    params: { detail: message },
  });
  throw error;
}

const xmlEscape = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
function xmlText(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const point =
        entity[1].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      if (!Number.isSafeInteger(point) || point < 0 || point > 0x10ffff)
        invalid('Invalid XML character.');
      return String.fromCodePoint(point);
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()];
  });
}
function attributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [
      match[1],
      xmlText(match[2] ?? match[3]),
    ]),
  );
}

/**
 * Read only ordinary, unencrypted ZIP members into memory. Nothing is extracted
 * to disk. Central-directory sizes and inflate output caps bound ZIP bombs; ZIP64
 * and unsupported compression are rejected instead of being guessed at.
 */
function unzip(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) invalid('The file is not a valid XLSX workbook.');
  const count = bytes.readUInt16LE(end + 10),
    directorySize = bytes.readUInt32LE(end + 12),
    directoryOffset = bytes.readUInt32LE(end + 16);
  if (
    count === 0xffff ||
    count > 3000 ||
    directoryOffset + directorySize > end ||
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6)
  )
    invalid('Unsupported XLSX archive.');
  const result = new Map();
  let cursor = directoryOffset,
    expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50)
      invalid('Invalid XLSX directory.');
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      compressedSize = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28),
      extraLength = bytes.readUInt16LE(cursor + 30),
      commentLength = bytes.readUInt16LE(cursor + 32),
      offset = bytes.readUInt32LE(cursor + 42);
    if (
      cursor + 46 + nameLength + extraLength + commentLength > bytes.length ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      offset + 30 > bytes.length ||
      bytes.readUInt32LE(offset) !== 0x04034b50
    )
      invalid('Encrypted or invalid XLSX member.');
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const start =
      offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    expanded += size;
    if (
      expanded > maximumExpandedBytes ||
      start + compressedSize > bytes.length ||
      size > maximumExpandedBytes ||
      compressedSize === 0xffffffff ||
      size === 0xffffffff
    )
      invalid('The expanded workbook is too large.');
    let content;
    try {
      content =
        method === 0
          ? bytes.subarray(start, start + compressedSize)
          : inflateRawSync(bytes.subarray(start, start + compressedSize), {
              maxOutputLength: Math.max(1, size),
            });
    } catch {
      invalid('Invalid or oversized compressed XLSX member.');
    }
    if (
      content.length !== size ||
      crc32(content) !== bytes.readUInt32LE(cursor + 16) ||
      result.has(name)
    )
      invalid('Invalid XLSX member checksum, size or duplicate name.');
    result.set(name, content.toString('utf8'));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

const textRuns = (source) =>
  [...source.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
    .map((match) => xmlText(match[1]))
    .join('');
function readXlsx(bytes) {
  const files = unzip(bytes);
  // OOXML uses escaped text, not DTDs. Reject entity declarations explicitly; no
  // external entities or macros are resolved or executed by this limited reader.
  if ([...files.values()].some((value) => /<!DOCTYPE|<!ENTITY/i.test(value)))
    invalid('XML entity declarations are not supported.');
  const workbook = files.get('xl/workbook.xml') || '';
  const sheet = workbook.match(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/);
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (sheet) {
    const id = attributes(sheet[1])['r:id'];
    const relations = files.get('xl/_rels/workbook.xml.rels') || '';
    for (const relation of relations.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/g)) {
      const attrs = attributes(relation[1]);
      if (attrs.Id === id) {
        if (attrs.TargetMode === 'External') invalid('External worksheets are not supported.');
        sheetPath = attrs.Target.startsWith('/')
          ? attrs.Target.slice(1)
          : path.posix.normalize('xl/' + attrs.Target);
        break;
      }
    }
  }
  const xml = files.get(sheetPath);
  if (!xml) invalid('The workbook has no readable worksheet.');
  const shared = [
    ...(files.get('xl/sharedStrings.xml') || '').matchAll(
      /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g,
    ),
  ].map((match) => textRuns(match[1]));
  const rows = [];
  const seenRows = new Set();
  for (const row of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    if (rows.length >= maximumRows) invalid('The workbook has too many rows.');
    const values = [];
    const sourceRow = Number(attributes(row[1]).r || (rows.at(-1)?.sourceRow || 0) + 1);
    if (
      !Number.isSafeInteger(sourceRow) ||
      sourceRow < 1 ||
      sourceRow > 1048576 ||
      seenRows.has(sourceRow)
    )
      invalid('Invalid or duplicate worksheet row address.');
    seenRows.add(sourceRow);
    Object.defineProperty(values, 'sourceRow', { value: sourceRow });
    for (const cell of row[2].matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
    )) {
      const attrs = attributes(cell[1]),
        contents = cell[2] || '';
      const address = attrs.r?.match(/^([A-Z]+)([1-9]\d*)$/i);
      if (attrs.r && (!address || Number(address[2]) !== sourceRow))
        invalid('Invalid worksheet cell address.');
      const letters = address?.[1];
      const column = letters
        ? [...letters.toUpperCase()].reduce(
            (sum, char) => sum * 26 + char.charCodeAt(0) - 64,
            0,
          ) - 1
        : values.length;
      if (column >= maximumColumns || Object.hasOwn(values, column))
        invalid('The workbook has too many columns or duplicate cells.');
      const raw = contents.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      const value =
        attrs.t === 's'
          ? shared[Number(raw)]
          : attrs.t === 'inlineStr'
            ? textRuns(contents)
            : xmlText(raw ?? '');
      if (value == null) invalid('Invalid shared string reference.');
      values[column] = { value, formula: /<(?:\w+:)?f\b/.test(contents) };
    }
    rows.push(values);
  }
  return rows;
}

function readCsv(source) {
  const rows = [],
    row = [];
  let field = '',
    quoted = false,
    endedQuote = false;
  const pushField = () => {
    if (row.length >= maximumColumns) invalid('The file has too many columns.');
    row.push({ value: field, formula: false });
    field = '';
    endedQuote = false;
  };
  const pushRow = () => {
    pushField();
    if (rows.length >= maximumRows) invalid('The file has too many rows.');
    rows.push(row.splice(0));
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          endedQuote = true;
        }
      } else field += char;
    } else if (char === '"' && !field && !endedQuote) quoted = true;
    else if (char === ',') pushField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      pushRow();
    } else if (endedQuote) invalid('Unexpected text after a quoted CSV field.');
    else field += char;
  }
  if (quoted) invalid('A CSV quoted field is not closed.');
  if (field || row.length || endedQuote) pushRow();
  return rows;
}

export function readSpreadsheet(fileName, base64) {
  if (typeof fileName !== 'string' || !/\.(xlsx|csv)$/i.test(fileName))
    invalid('Choose an .xlsx or .csv file.');
  if (
    typeof base64 !== 'string' ||
    !base64.length ||
    base64.length % 4 ||
    base64.length > Math.ceil(maximumFileBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    invalid('Invalid or oversized file content.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > maximumFileBytes) invalid('The file exceeds 8 MB.');
  try {
    return /\.xlsx$/i.test(fileName)
      ? readXlsx(bytes)
      : readCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error.code === 'errImport') throw error;
    invalid('The workbook is malformed or unsupported.');
  }
}

function zip(files) {
  const contents = [],
    directory = [];
  let offset = 0;
  for (const [name, content] of files) {
    const filename = Buffer.from(name),
      data = Buffer.from(content),
      checksum = crc32(data),
      local = Buffer.alloc(30),
      central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    contents.push(local, filename, data);
    directory.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...contents, central, end]);
}
function columnName(index) {
  let name = '';
  for (index++; index > 0; index = Math.floor((index - 1) / 26))
    name = String.fromCharCode(65 + ((index - 1) % 26)) + name;
  return name;
}

/** A small standards-based XLSX template writer: strings remain text, never formulas. */
export function writeSpreadsheet(
  rows,
  { widths = [], inputColumns = [], freezeColumns = 0 } = {},
) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const lastColumn = columnName(columnCount - 1);
  const inputs = new Set(inputColumns);
  const columns = Array.from(
    { length: columnCount },
    (_, index) =>
      `<col min="${index + 1}" max="${index + 1}" width="${widths[index] || 20}" customWidth="1"/>`,
  ).join('');
  // Style indexes: header, read-only identifiers, and clearly marked entry cells.
  // Values remain inline strings, including formula-like text and leading zeroes.
  const sheet = rows
    .map(
      (row, index) =>
        `<row r="${index + 1}" ht="${index === 0 ? 30 : 24}" customHeight="1">${row.map((value, column) => `<c r="${columnName(column)}${index + 1}" s="${index === 0 ? 1 : inputs.has(column) ? 3 : 2}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join('')}</row>`,
    )
    .join('');
  return zip([
    [
      'xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF243746"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts>
        <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF334E68"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F6F9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF8DF"/><bgColor indexed="64"/></patternFill></fill></fills>
        <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>
        <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
      </styleSheet>`,
    ],
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Production import" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    [
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${Math.max(1, rows.length)}"/><sheetViews><sheetView workbookViewId="0"><pane ${freezeColumns ? `xSplit="${freezeColumns}" ` : ''}ySplit="1" topLeftCell="${columnName(freezeColumns)}2" activePane="${freezeColumns ? 'bottomRight' : 'bottomLeft'}" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${sheet}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(1, rows.length)}"/></worksheet>`,
    ],
  ]);
}
