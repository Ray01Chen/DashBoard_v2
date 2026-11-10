/** Browser-only display preferences; never part of production CONFIG. */
export const boardDisplayDefaults = {
  header: true,
  filters: true,
  group: true,
  alerts: true,
  carousel: true,
  trend: false,
  share: false,
};
export function boardDisplayPreferences(saved, legacy = {}) {
  return Object.fromEntries(
    Object.entries(boardDisplayDefaults).map(([key, fallback]) => [
      key,
      typeof saved?.[key] === 'boolean'
        ? saved[key]
        : typeof legacy[key] === 'boolean'
          ? legacy[key]
          : fallback,
    ]),
  );
}
