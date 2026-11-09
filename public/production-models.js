/** A missing model belongs to the migrated model, never today's first catalog item.
 * This rule also identifies old report snapshots without rewriting their history. */
export const DEFAULT_MODEL = 'Default';
export const modelOf = (row) => row?.model || DEFAULT_MODEL;
export const productionKey = (row) => JSON.stringify([row?.line, modelOf(row)]);
export const productionLabel = (row) => `${row.line} · ${modelOf(row)}`;
/** Visible identities separate the line from the longer model. Keep the plain
 * label for native options, exports and accessible descriptions. Callers supply
 * their existing HTML escaper; neither catalog value is trusted as markup. */
export function productionIdentityMarkup(row, esc, { singleLine = false } = {}) {
  const name = modelOf(row);
  const separator = name.indexOf('-');
  const main = separator < 0 ? name : name.slice(0, separator);
  const suffix = separator < 0 ? '' : name.slice(separator + 1);
  return `<span class="production-identity" title="${esc(productionLabel(row))}"><span class="production-line">${esc(row.line)}</span><span class="production-model${singleLine ? ' production-model-single' : ''}">${singleLine ? esc(name) : `<span class="production-model-main">${esc(main)}</span>${suffix ? `<span class="production-model-suffix">(${esc(suffix)})</span>` : ''}`}</span></span>`;
}
export const sameProduction = (a, b) => productionKey(a) === productionKey(b);

/** Prefer captured structured people: commas inside a real name are not
 * separators. Split only old combined text when no structured roster exists. */
export function personnelNames(record, role, legacy = '') {
  const people = record?.defaultsSnapshot?.personnel?.[role] || record?.personnel?.[role];
  return people
    ? people.map((person) => person.name).filter(Boolean)
    : String(legacy || '')
        .split(/[,，\n]+/)
        .map((name) => name.trim())
        .filter(Boolean);
}

/** Old mappings produce output by default. A current setting governs entry even
 * when the displayed identity comes from a saved snapshot; never rewrite it. */
export function stationHasOutput(row, config) {
  const current = config?.rows?.find((item) => item.id === row?.id);
  return (current || row)?.hasOutput !== false;
}

/** Current configuration order also governs saved snapshots. Unknown historic
 * IDs remain in their original relative order after known configured rows. */
export function orderedStationRows(config, rows) {
  const rank = new Map((config.rows || []).map((row, index) => [row.id, index]));
  return [...rows].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Legacy catalogs are readable by importers and older clients during migration. */
export function productionUnits(config) {
  return (
    config.productionUnits ??
    (config.lines || []).map((line) => ({
      line,
      model: DEFAULT_MODEL,
      dailyTarget: Object.hasOwn(config.lineTargets || {}, line) ? config.lineTargets[line] : null,
      staffing: (Object.hasOwn(config.lineStaffing || {}, line)
        ? config.lineStaffing[line]
        : null) || { day: [], night: [], owners: [] },
    }))
  );
}
export const unitFor = (config, row) =>
  productionUnits(config).find((unit) => sameProduction(unit, row));
export const staffingFor = (config, row) => unitFor(config, row)?.staffing || {};

/** Output station selection is per model. A former line-level selection maps
 * to the same job/station in another model, rather than selecting its row ID. */
export function outputSourceFor(config, unit) {
  const sources = config.monitoring?.unitOutputSources || {};
  const key = productionKey(unit);
  const rows = (config.rows || []).filter(
    (row) =>
      row.active !== false && !row.deleted && stationHasOutput(row) && sameProduction(row, unit),
  );
  const source = Object.hasOwn(sources, key)
    ? sources[key]
    : config.monitoring?.outputSources?.[unit.line];
  // Legacy catalogs without models retain their aggregate mode. Current
  // line/model production always uses one station to avoid counting a product
  // repeatedly as it passes through several stations.
  if ((source === 'all' && !config.models) || rows.some((row) => row.id === source)) return source;
  const former = (config.rows || []).find((row) => row.id === source);
  return (
    (
      rows.find((row) => former && row.job === former.job && row.station === former.station) ||
      rows.find((row) => /pack/i.test(row.station || '')) ||
      rows.filter((row) => row.station).at(-1) ||
      rows[0]
    )?.id ?? null
  );
}

/** One-way settings migration. Report rows and captured report defaults stay intact. */
export function upgradeProductionModels(config) {
  let changed = false;
  if (!Array.isArray(config.models)) {
    config.models = [DEFAULT_MODEL];
    changed = true;
  }
  if (!Array.isArray(config.productionUnits)) {
    config.productionUnits = productionUnits({ ...config, productionUnits: undefined }).map(
      (unit) => structuredClone(unit),
    );
    changed = true;
  }
  for (const row of config.rows || []) {
    if (!row.model) {
      row.model = DEFAULT_MODEL;
      changed = true;
    }
  }
  return changed;
}

/** Add an empty line/model without borrowing another model's setup. Removing
 * the pair deletes its current mappings while retaining their historical IDs. */
export function setProductionUnit(config, line, model, enabled) {
  if (!config.lines.includes(line) || !config.models?.includes(model)) return false;
  const row = { line, model };
  config.productionUnits ||= productionUnits(config);
  const exists = unitFor(config, row);
  if (enabled && !exists)
    config.productionUnits.push({
      ...row,
      dailyTarget: null,
      staffing: { day: [], night: [], owners: [] },
    });
  if (!enabled) {
    config.productionUnits = config.productionUnits.filter((unit) => !sameProduction(unit, row));
    for (const mapping of config.rows)
      if (sameProduction(mapping, row)) Object.assign(mapping, { active: false, deleted: true });
  }
  return true;
}
