/** Presentation order is personal; source arrays and CONFIG are never mutated.
 * With no preference, retain the API/config sequence instead of sorting names. */
let catalogs = {},
  preferences = {};
export function setPersonalOrders(lists = {}, orders = {}) {
  catalogs = lists;
  preferences = orders;
}
export function preferenceOrder(values, listId, key = (value) => value) {
  if (!preferences[listId]?.items || preferences[listId].version === 0) return [...values];
  const rank = new Map((preferences[listId]?.items || []).map((id, index) => [id, index]));
  return [...values].sort(
    (a, b) => (rank.get(key(a)) ?? Infinity) - (rank.get(key(b)) ?? Infinity) || 0,
  );
}
export function listOrder(values, _language, label = (value) => value, listId) {
  if (!values.length) return [];
  const identity = (value) => {
    const item = value?.item || value?.person || value;
    return typeof item === 'object' ? item.id : item;
  };
  // Every caller names its list type. Matching by labels across catalogs
  // would mix preferences when a job and station happen to share a name.
  if (!listId || !catalogs[listId])
    return [...values].sort((a, b) => {
      const rank = (item) =>
        ['displayOrder', 'sequence', 'configOrder', 'order']
          .map((key) => item?.[key])
          .find(Number.isFinite) ?? Infinity;
      return rank(a) - rank(b) || 0;
    });
  return preferenceOrder(values, listId, (value) => {
    const key = identity(value);
    return catalogs[listId].find((item) => item.id === key || item.label === label(value))?.id;
  });
}
export const byProduction = (values) =>
  preferenceOrder(values, 'units', (value) =>
    JSON.stringify([value.line, value.model || 'Default']),
  );
