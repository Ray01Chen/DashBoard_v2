import { productionUnits, productionKey, modelOf } from './production-models.js';

const fields = { lines: 'line', models: 'model', jobs: 'job', stations: 'station' };
const matches = (row, catalog, value) =>
  (catalog === 'models' ? modelOf(row) : row[fields[catalog]]) === value;

export function catalogImpact(config, catalog, value) {
  return {
    mappings: config.rows.filter((row) => row.active && matches(row, catalog, value)).length,
    people:
      catalog === 'jobs' ? (config.personnel || []).filter((p) => p.job === value).length : 0,
    units: ['lines', 'models'].includes(catalog)
      ? productionUnits(config).filter((unit) => matches(unit, catalog, value)).length
      : 0,
  };
}

/** Rename live configuration references together. Saved report snapshots are
 * stored separately and never receive a catalog rename or deletion. */
export function renameCatalogItem(config, catalog, old, name) {
  if (
    !fields[catalog] ||
    !name.trim() ||
    name.length > 60 ||
    config[catalog].some(
      (item) => item !== old && item.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    return false;
  const index = config[catalog].indexOf(old);
  if (index < 0) return false;
  config[catalog][index] = name;
  for (const row of config.rows) if (matches(row, catalog, old)) row[fields[catalog]] = name;
  if (['lines', 'models'].includes(catalog))
    for (const unit of config.productionUnits || [])
      if (matches(unit, catalog, old)) unit[fields[catalog]] = name;
  if (catalog === 'jobs')
    for (const person of config.personnel || []) if (person.job === old) person.job = name;
  for (const field of ['unitOutputSources', 'capacity'])
    if (['lines', 'models'].includes(catalog) && config.monitoring?.[field]) {
      config.monitoring[field] = Object.fromEntries(
        Object.entries(config.monitoring[field]).map(([key, source]) => {
          const [line, model] = JSON.parse(key);
          const unit = { line, model };
          if (matches(unit, catalog, old)) unit[fields[catalog]] = name;
          return [productionKey(unit), source];
        }),
      );
    }
  if (catalog === 'lines') {
    for (const group of config.monitoring?.groups || [])
      group.lines = group.lines.map((line) => (line === old ? name : line));
    for (const map of [
      config.lineTargets,
      config.lineStaffing,
      config.lineSchedules,
      config.monitoring?.outputSources,
    ]) {
      if (!map || !Object.hasOwn(map, old) || name === old) continue;
      Object.defineProperty(map, name, {
        value: map[old],
        enumerable: true,
        writable: true,
        configurable: true,
      });
      delete map[old];
    }
  }
  return true;
}

/** Delete directory entries and unlink their IDs from every current team and
 * owner list. Production snapshots are separate and remain historical facts. */
export function removePersonnel(config, ids) {
  const removed = new Set(ids);
  config.personnel = (config.personnel || []).filter((person) => !removed.has(person.id));
  for (const staffing of [
    ...Object.values(config.lineStaffing || {}),
    ...productionUnits(config).map((unit) => unit.staffing || {}),
  ]) {
    for (const role of ['day', 'night', 'owners'])
      staffing[role] = (staffing[role] || []).filter((id) => !removed.has(id));
  }
}

/** Remove current mappings and, for a job, its people and assignments together.
 * Historical mapping IDs and saved report snapshots remain separate. */
export function removeCatalogItem(config, catalog, value) {
  if (!fields[catalog] || !config[catalog]?.includes(value)) return false;
  for (const row of config.rows)
    if (matches(row, catalog, value)) Object.assign(row, { active: false, deleted: true });
  if (['lines', 'models'].includes(catalog))
    config.productionUnits = productionUnits(config).filter(
      (unit) => !matches(unit, catalog, value),
    );
  if (catalog === 'jobs') {
    removePersonnel(
      config,
      (config.personnel || [])
        .filter((person) => person.job === value)
        .map((person) => person.id),
    );
  }
  config[catalog] = config[catalog].filter((item) => item !== value);
  for (const field of ['unitOutputSources', 'capacity'])
    if (config.monitoring?.[field]) {
      const keys = new Set(productionUnits(config).map(productionKey));
      config.monitoring[field] = Object.fromEntries(
        Object.entries(config.monitoring[field]).filter(([key]) => keys.has(key)),
      );
    }
  if (catalog === 'lines') {
    for (const group of config.monitoring?.groups || [])
      group.lines = group.lines.filter((line) => line !== value);
    for (const map of [
      config.lineTargets,
      config.lineStaffing,
      config.lineSchedules,
      config.monitoring?.outputSources,
    ])
      if (map) delete map[value];
  }
  return true;
}
