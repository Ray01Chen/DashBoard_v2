import { productionUnits, productionKey, productionLabel } from './production-models.js';
import { issuePresets } from './issue-presets.js';

/** Stable IDs, not translated labels, identify personal presentation choices.
 * Station mappings and chronological slots intentionally remain business order. */
export function personalLists(config) {
  const strings = (items = []) => items.map((value) => ({ id: value, label: value }));
  return {
    lines: strings(config.lines),
    models: strings(config.models),
    jobs: strings(config.jobs),
    stations: strings(config.stations),
    units: productionUnits(config).map((unit) => ({
      id: productionKey(unit),
      label: productionLabel(unit),
    })),
    groups: (config.monitoring?.groups || []).map((item) => ({
      id: item.id,
      label: item.name,
    })),
    people: (config.personnel || []).map((item) => ({ id: item.id, label: item.name })),
    issues: issuePresets(config).map((item) => ({ id: item.id, label: item.label })),
    templates: (config.scheduleTemplates || []).map((item) => ({
      id: item.id,
      label: item.name,
    })),
  };
}

export function reconcileOrder(saved, available) {
  const keys = new Set(available);
  const kept = [...new Set(saved)].filter((id) => keys.has(id));
  const existing = new Set(kept);
  return [...kept, ...available.filter((id) => !existing.has(id))];
}
