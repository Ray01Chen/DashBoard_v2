/** Shared route catalog: the HTTP server and browser resolve the same pages.
 * Page paths are deliberately separate from /api resources, so a future server
 * renderer can replace a page without changing saved links or API contracts. */
export const pagePaths = {
  overview: '/overview',
  details: '/details',
  entry: '/entry',
  help: '/guide',
};
export const settingsPaths = {
  structure: '/settings/master-data',
  targets: '/settings/daily-targets',
  personnel: '/settings/people',
  staffing: '/settings/assignments',
  workforce: '/settings/line-configuration',
  groups: '/settings/groups',
  alerts: '/settings/alerts',
  appearance: '/settings/appearance',
};
export function pagePath(view, tab = 'structure') {
  return view === 'settings' ? settingsPaths[tab] || settingsPaths.structure : pagePaths[view];
}
export function resolvePage(pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return { view: 'overview' };
  if (path === '/settings') return { view: 'settings', tab: 'structure' };
  for (const [view, value] of Object.entries(pagePaths)) if (path === value) return { view };
  for (const [tab, value] of Object.entries(settingsPaths))
    if (path === value) return { view: 'settings', tab };
  return null;
}
