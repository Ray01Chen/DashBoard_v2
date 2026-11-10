/** Sort presentation copies only. Station/slot renderers deliberately retain
 * their configured sequence; catalog IDs and saved array indexes never move. */
const collators = new Map();
function collator(language) {
  const locale = language || globalThis.document?.documentElement.lang || 'en';
  if (!collators.has(locale))
    collators.set(locale, new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }));
  return collators.get(locale);
}
const rank = (value) => {
  for (const key of ['displayOrder', 'sequence', 'configOrder', 'order'])
    if (typeof value?.[key] === 'number' && Number.isFinite(value[key])) return value[key];
  return null;
};
export function naturalOrder(values, language, label = (value) => value) {
  const compare = collator(language).compare;
  return [...values].sort((a, b) => {
    const left = rank(a),
      right = rank(b);
    if (left !== null || right !== null) {
      const difference = (left ?? Infinity) - (right ?? Infinity);
      if (difference) return difference;
    }
    const x = [label(a)].flat(),
      y = [label(b)].flat();
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const difference = compare(String(x[i] ?? ''), String(y[i] ?? ''));
      if (difference) return difference;
    }
    return 0;
  });
}
export const byProduction = (values, language) =>
  naturalOrder(values, language, (value) => [value.line, value.model || 'Default']);
