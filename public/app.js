import { naturalOrder, byProduction } from './list-order.js';
import { linePickerMarkup, linePickerGroups, updateLinePicker } from './line-picker.js';
import { handleMonitorAction } from './monitor-ui.js';
import { schedulePreview } from './schedule-preview.js';
import { alertConfig, validAlertConfig } from './alerts.js';
import {
  scheduleFor,
  scheduleCatalog,
  schedulesForLine,
  scheduleTemplate,
  editScheduleTemplate,
  applyScheduleTemplate,
} from './production-schedules.js';
import { createEntryController } from './entry.js';
import { pagePath, resolvePage } from './pages.js';
import { issuePresets, issueSettingsMarkup, validateIssuePresets } from './issue-presets.js';
import {
  productionUnits,
  orderedStationRows,
  unitFor,
  modelOf,
  productionKey,
  productionLabel,
  productionIdentityMarkup,
  setProductionUnit,
  stationHasOutput,
  personnelNames,
} from './production-models.js';
import { catalogImpact, renameCatalogItem, removeCatalogItem } from './catalog-settings.js';
import {
  workforceSettingsMarkup,
  lineStaffingMarkup,
  staffSettingsMarkup,
  handleWorkforceChange,
  handleWorkforceAction,
  lineModelsMarkup,
  changeStaffAssignment,
  addStaffAssignments,
  staffPickerMarkup,
  targetsSettingsMarkup,
  createSettingsId,
  addBatchMappings,
  mappingSelection,
  removeMapping,
  reorderMapping,
  updateMapping,
  setupSteps,
  setupTitleKeys,
  setupReadiness,
  setupAccess,
} from './workforce-settings.js';
import { helpMarkup } from './help.js';
import { showLineDetail } from './line-detail.js';
import { linesForGroup, currentScheduleInterval, monitoringPeriodState } from './monitor.js';
import { translate, localeTags, locales } from './i18n.js';
import { renderMonitoring, groupSettings, alertSettings } from './dashboard.js';

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const paths = {
  factory: 'M3 21V10l6 3V7l6 3V3h6v18H3Z',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  clipboard: 'M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 12h8 M8 16h5',
  alert: 'm12 3 10 18H2L12 3Z M12 9v5 M12 17h.01',
  plus: 'M12 5v14 M5 12h14',
  calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
  layers: 'm12 3 10 5-10 5L2 8l10-5Z M2 12l10 5 10-5 M2 16l10 5 10-5',
  trend: 'm3 17 6-6 4 4 8-10 M15 5h6v6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  refresh: 'M20 8a8 8 0 1 0 0 9 M20 3v6h-6',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
  edit: 'm15 4 5 5 M4 16 16 4a2 2 0 0 1 4 4L8 20H4v-4Z',
  close: 'm6 6 12 12 M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  trash: 'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7h.01',
  settings:
    'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  sliders: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  panel: 'M3 4h18v16H3z M9 4v16 M15 9l-3 3 3 3',
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c5 5 5 13 0 18 M12 3c-5 5-5 13 0 18',
  palette:
    'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a1 1 0 0 1 0-2h3a5 5 0 0 0 5-5c0-4-5-7-9-7Z M7 9h.01 M11 6h.01 M16 8h.01 M6 14h.01',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.info}"/></svg>`;
function hydrate(root = document) {
  root.querySelectorAll('[data-icon]').forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
}
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const themes = ['delta', 'green', 'indigo', 'amber', 'rose'];
paths.fullscreen = 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5';
paths.logout = 'M9 4H4v16h5 M14 8l4 4-4 4 M8 12h12';
const draftId = () => createSettingsId();
function stored(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
  return null;
}
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
const state = {
  user: null,
  config: null,
  records: new Map(),
  rowVersions: {},
  activity: {},
  serverOffset: 0,
  defaults: {},
  dailyReport: null,
  detailGroupId: '',
  boardPage: 0,
  scheduleLine: '',
  scheduleTemplateId: 'default',
  scheduleApplyLines: [],
  groupId: '',
  chartLine: '',
  date: today(),
  shift: 'day',
  overviewScope: 'all',
  loadedScope: '',
  line: '',
  slotId: '',
  search: '',
  status: 'all',
  view: 'overview',
  page: 1,
  pageSize: 10,
  loading: true,
  sequence: 0,
  language: locales.includes(stored('bp-language')) ? stored('bp-language') : 'en',
  theme: themes.includes(stored('bp-theme')) ? stored('bp-theme') : 'delta',
  collapsed: stored('bp-collapsed') === 'true',
  draft: null,
  settingsTab: 'structure',
  mappingLine: null,
  mappingModel: '',
  unitFilterLine: '',
  unitAdd: { line: '', model: '' },
  staffingLine: null,
  staffingModel: '',
  staffChoices: {},
  targetLine: null,
  personJob: null,
  mappingBatch: [{ job: '', station: '' }],
  connection: 'syncing',
  lastTime: null,
};
const canManage = () => state.user?.role === 'admin';
const t = (key, params) => translate(state.language, key, params);
const number = (v) =>
  v == null ? '—' : new Intl.NumberFormat(localeTags[state.language]).format(v);
const hasWholeDayScope = () => ['overview', 'details'].includes(state.view);
const reportScope = () => (hasWholeDayScope() ? state.overviewScope : state.shift);
function syncReportScopeButtons() {
  const scope = reportScope();
  for (const button of $$('[data-report-scope]')) {
    const selected = button.dataset.reportScope === scope;
    button.hidden = button.dataset.reportScope === 'all' && !hasWholeDayScope();
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}
const label = (s) => `${s.start}–${s.end}`;
const minutes = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};
const duration = (s) => (minutes(s.end) - minutes(s.start) + 1440) % 1440;
const overnight = (s) => s.end < s.start;
let entryController,
  settingsSaving = false,
  toastTimer,
  confirmResolve,
  settingsSnapshot = '';
let pageIndex = Number.isInteger(history.state?.pageIndex) ? history.state.pageIndex : 0;
let handlingPageHistory = false;
let restoringPageHistory = false;
history.replaceState({ ...history.state, pageIndex }, '', location.href);

/** Retain real page addresses without reloading a shared settings draft. Only
 * a successful guarded transition creates history; rerenders never add pages. */
function syncPageAddress(replace = false) {
  if (!state.user || !state.config || handlingPageHistory) return;
  const path = pagePath(state.view, state.settingsTab);
  if (!path || location.pathname === path) return;
  if (!replace) pageIndex++;
  history[replace ? 'replaceState' : 'pushState']({ pageIndex }, '', path);
}
function followPageLink(event) {
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return false;
  event.preventDefault();
  return true;
}
window.addEventListener('popstate', async (event) => {
  if (restoringPageHistory) {
    restoringPageHistory = false;
    return;
  }
  const nextIndex = event.state?.pageIndex;
  const route = resolvePage(location.pathname);
  if (!route || !Number.isInteger(nextIndex)) return;
  handlingPageHistory = true;
  const accepted = await setView(route.view, { tab: route.tab, history: false });
  handlingPageHistory = false;
  if (accepted) {
    pageIndex = nextIndex;
    syncPageAddress(true);
  } else if (nextIndex !== pageIndex) {
    restoringPageHistory = true;
    history.go(pageIndex - nextIndex);
  }
});
hydrate();
$('#report-date').value = state.date;
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 5000);
}
async function api(url, options = {}) {
  let res;
  const { allowAnonymous = false, ...request } = options;
  try {
    res = await fetch(url, {
      ...request,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': state.language,
        ...request.headers,
      },
    });
  } catch {
    const e = new Error(t('errNetwork'));
    e.code = 'errNetwork';
    throw e;
  }
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !allowAnonymous) showLogin(true);
    const e = new Error(data.code ? t(data.code, data.params) : data.error || t('errServer'));
    e.code = data.code;
    e.params = data.params;
    throw e;
  }
  return data;
}
function applyAccess() {
  $$('[data-admin-only]').forEach((el) => (el.hidden = !canManage()));
  $('#current-user').textContent = state.user
    ? `${state.user.username} · ${t(state.user.role)}`
    : '';
  $('#logout').hidden = !state.user;
}
function showLogin(expired = false) {
  state.user = null;
  document.body.classList.remove('authenticated');
  applyAccess();
  $('#login-error').hidden = !expired;
  if (expired) showError('#login-error', { code: 'errAuth' });
  if (!$('#login-dialog').open) $('#login-dialog').showModal();
}
async function initializeWorkspace(user) {
  state.user = user;
  const requestedPage = resolvePage(location.pathname) || { view: 'overview' };
  state.view = requestedPage.view;
  state.settingsTab = requestedPage.tab || 'structure';
  if (!canManage() && state.view === 'settings') {
    state.view = 'overview';
    state.draft = null;
  }
  state.config = await api('/api/config');
  if (state.view === 'settings') beginSettingsDraft();
  if (!state.scopeInitialized) {
    const date = today(),
      yesterday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(Date.now() - 86400000));
    for (const day of [date, yesterday])
      for (const shift of ['day', 'night'])
        if (currentScheduleInterval(state.config, day, shift, Date.now())) {
          state.date = day;
          state.shift = shift;
        }
    state.scopeInitialized = true;
    $('#report-date').value = state.date;
    syncReportScopeButtons();
  }
  if (!stored('bp-theme')) applyTheme(state.config.theme);
  if (!stored('bp-language')) applyLanguage(state.config.language);
  document.body.classList.add('authenticated');
  applyAccess();
  updateHeadings();
  populateLineFilters();
  await loadRecords();
  if (state.view === 'settings') renderSettings();
  syncPageAddress(true);
}
function showError(selector, error) {
  const el = $(selector);
  el.dataset.errorCode = error.code || 'errServer';
  el.dataset.errorParams = JSON.stringify(error.params || {});
  el.textContent = t(el.dataset.errorCode, error.params);
  el.hidden = false;
}
function applyTheme(theme, persist = false) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(
    document.documentElement,
  )
    .getPropertyValue('--primary')
    .trim();
  $('#theme-select').value = theme;
  if (persist) stored('bp-theme', theme);
  if (state.config) renderChart();
}
function applyCollapse() {
  document.body.classList.toggle('sidebar-collapsed', state.collapsed);
  const b = $('#collapse-sidebar');
  b.setAttribute('aria-expanded', String(!state.collapsed));
  b.title = t(state.collapsed ? 'expand' : 'collapse');
  b.setAttribute('aria-label', b.title);
}
function translateStatic(root = document) {
  for (const [attribute, target] of [
    ['data-i18n', 'textContent'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria', 'aria-label'],
  ])
    root.querySelectorAll(`[${attribute}]`).forEach((e) => {
      const value = t(e.getAttribute(attribute));
      if (target === 'aria-label') e.setAttribute(target, value);
      else e[target] = value;
    });
}
function applyLanguage(language, persist = false) {
  state.language = language;
  document.documentElement.lang = { zh: 'zh-Hant', en: 'en', th: 'th' }[language];
  document.title = `BP9 · ${t('appTitle')}`;
  $('#language-select').value = language;
  $('#login-language').value = language;
  if (persist) stored('bp-language', language);
  translateStatic();
  $('#save-settings').innerHTML =
    icon('check') + esc(t(settingsSaving ? 'saving' : 'saveSettings'));
  $$('.error-banner[data-error-code]').forEach(
    (el) =>
      (el.textContent = t(el.dataset.errorCode, JSON.parse(el.dataset.errorParams || '{}'))),
  );
  $('#toast').hidden = true;
  $('#theme-select').innerHTML = naturalOrder(themes, state.language, (theme) => t(theme))
    .map((v) => `<option value="${v}">${esc(t(v))}</option>`)
    .join('');
  $('#theme-select').value = state.theme;
  applyCollapse();
  updateConnection();
  updateHeadings();
  applyAccess();
  if (state.config) {
    populateLineFilters();
    render();
    if (state.view === 'settings' && canManage()) renderSettings();
  }
}
function updateConnection() {
  const e = $('#connection');
  e.innerHTML = `<i></i><span>${esc(t(state.connection))}</span>`;
  e.classList.toggle('offline', state.connection === 'offline');
  if (state.lastTime)
    $('#last-updated').textContent = t('lastSync', {
      time: new Date(state.lastTime).toLocaleTimeString(localeTags[state.language], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
}
function updateHeadings() {
  const view = state.view;
  document.body.dataset.page = view;
  document.title = `BP9 · ${t(view)}`;
  $('#breadcrumb').textContent = t(view);
  $('#page-title').textContent = t(view);
  $('#page-description').textContent = t(`${view}Desc`);
  $('#table-heading').textContent = t('tableTitle');
  $('#table-description').textContent = t('tableDesc');
  $('#report-content').hidden = ['settings', 'help'].includes(view);
  // Entry shows both shifts or explicit interval buttons. A second shift picker
  // in the report toolbar would imply that it filters the whole-day sheet.
  $('.filter-bar .segmented').hidden = view === 'entry';
  syncReportScopeButtons();
  $('#export').hidden = view === 'entry';
  $('#help-content').hidden = view !== 'help';
  $('#settings-content').hidden = view !== 'settings';
  $('#overview-panels').hidden = view !== 'overview';
  $('#save-settings').hidden = view !== 'settings';
  $$('[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
    b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false');
  });
  const more = $('#nav-more');
  more.classList.toggle('active', ['details', 'settings', 'help'].includes(view));
  updateSettingsNavigation();
}
function updateSettingsNavigation() {
  const inSettings = state.view === 'settings';
  for (const button of document.querySelectorAll('[data-open-settings]')) {
    const active = inSettings && state.settingsTab === button.dataset.openSettings;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  }
  const settingsNav = $('[data-view="settings"]');
  settingsNav.classList.toggle('active', inSettings);
  settingsNav.setAttribute('aria-current', inSettings ? 'page' : 'false');
  if (inSettings) {
    const [title, description] = {
      structure: ['structure', 'catalogsDesc'],
      personnel: ['personnel', 'personnelDesc'],
      staffing: ['staffing', 'staffingDesc'],
      workforce: ['workforce', 'workforceDesc'],
      targets: ['targets', 'targetsDesc'],
      groups: ['groupSettings', 'groupsDesc'],
      alerts: ['alertSettings', 'alertSettingsDesc'],
      appearance: ['appearance', 'appearanceDesc'],
    }[state.settingsTab] || ['settings', 'settingsDesc'];
    $('#breadcrumb').textContent = t('settings') + ' / ' + t(title);
    document.title = `BP9 · ${t(title)}`;
    $('#page-title').textContent = t(title);
    $('#page-description').textContent = t(description);
  }
  if (!canManage()) $('#save-settings').hidden = true;
  applyAccess();
}
function allRows() {
  if (!state.config) return [];
  const rows = state.config.rows
    .filter((r) => r.active || state.records.has(r.id))
    .map((r) => state.records.get(r.id)?.rowSnapshot || r);
  for (const r of state.records.values())
    if (!rows.some((v) => v.id === r.rowId) && r.rowSnapshot) rows.push(r.rowSnapshot);
  return orderedStationRows(state.config, rows);
}
function detailUnits() {
  const allowed = linesForGroup(
    state.config,
    state.detailGroupId,
    allRows().map((row) => row.line),
  );
  return byProduction(
    [
      ...new Map(
        [...productionUnits(state.config), ...allRows()]
          .filter((row) => allowed.includes(row.line))
          .map((row) => [productionKey(row), row]),
      ).values(),
    ],
    state.language,
  );
}
function detailLines() {
  return detailUnits().map(productionKey);
}
function getRows() {
  const lines = detailLines();
  return byProduction(allRows(), state.language).filter(
    (row) =>
      (state.view !== 'details' || lines.includes(productionKey(row))) &&
      (!state.line || productionKey(row) === state.line),
  );
}
function schedule() {
  const scope = reportScope();
  if (!state.config) return [];
  const unit = detailUnits().find((unit) => productionKey(unit) === state.line);
  return unit
    ? scheduleFor(state.config, unit.line, scope)
    : scheduleCatalog(state.config, scope);
}
function allSlots() {
  const slots = schedule()
    .filter((s) => s.kind === 'production')
    .map((s) => ({ ...s, historical: false }));
  for (const r of state.records.values())
    for (const s of r.slots)
      if (!slots.some((v) => v.id === s.id)) slots.push({ ...s, historical: true });
  return slots;
}
function measurement(record, id = state.slotId) {
  return record?.slots.find((s) => s.id === id);
}
const hasData = (s) => s && ((s.actual !== null && s.actual !== undefined) || !!s.issue);
function populateLineFilters() {
  if (!state.config.monitoring.groups.some((g) => g.id === state.detailGroupId))
    state.detailGroupId = '';
  const values = detailLines();
  if (state.line && !values.includes(state.line)) state.line = '';
  const markup =
    '<option value="">' +
    esc(t('allLines')) +
    '</option>' +
    detailUnits()
      .map(
        (unit) =>
          '<option value="' +
          esc(productionKey(unit)) +
          '">' +
          esc(productionLabel(unit)) +
          '</option>',
      )
      .join('');
  for (const id of ['#line-select', '#detail-line']) {
    $(id).innerHTML = markup;
    $(id).value = state.line;
  }
  $('#detail-group').innerHTML =
    '<option value="">' +
    esc(t('allGroupOptions')) +
    '</option>' +
    naturalOrder(state.config.monitoring.groups, state.language, (group) => group.name)
      .map((g) => '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>')
      .join('');
  $('#detail-group').value = state.detailGroupId;
  $('#line-total').textContent = t('lineCount', { count: values.length });
}
function combineShiftReports(reports) {
  // Whole-day records are read-only projections. Entry must load each shift's
  // own revision before saving; the merged version is only for display.
  const savedByShift = Object.fromEntries(
    reports.map(([shift, data]) => [
      shift,
      new Map(data.records.map((row) => [row.rowId, row])),
    ]),
  );
  const defaultsByShift = Object.fromEntries(
    reports.map(([shift, data]) => [shift, data.defaults || {}]),
  );
  const savedIds = new Set(
    reports.flatMap(([, data]) => data.records.map((record) => record.rowId)),
  );
  const defaultIds = new Set(
    reports.flatMap(([, data]) => Object.keys(data.defaults || {}).map(Number)),
  );
  const combined = (rowId, includeUnsaved) => {
    const halves = reports
      .map(([shift]) => {
        const saved = savedByShift[shift].get(rowId);
        const value = saved || defaultsByShift[shift][rowId];
        return value
          ? {
              shift,
              saved,
              value,
              slots: (value.slots || []).map((slot) => ({
                ...slot,
                shift,
                ...(saved ? {} : { actual: slot.lineShared ? slot.actual : null, issue: '' }),
              })),
            }
          : null;
      })
      .filter(Boolean);
    if (!halves.length || (!includeUnsaved && !halves.some((half) => half.saved))) return null;
    const saved = halves.map((half) => half.saved).find(Boolean);
    const base = saved || halves[0].value;
    return {
      ...base,
      rowId,
      version: Math.max(0, ...halves.map((half) => half.saved?.version || 0)),
      dayTeam: halves.find((half) => half.shift === 'day')?.value.dayTeam,
      nightTeam: halves.find((half) => half.shift === 'night')?.value.nightTeam,
      owner: halves.find((half) => half.value.owner)?.value.owner,
      slots: halves.flatMap((half) => half.slots),
    };
  };
  return {
    configVersion: reports[0]?.[1].configVersion,
    serverTime: Math.max(...reports.map(([, data]) => data.serverTime || 0)),
    records: [...savedIds].map((id) => combined(id, false)).filter(Boolean),
    defaults: Object.fromEntries(
      [...defaultIds].map((id) => [id, combined(id, true)]).filter(([, value]) => value),
    ),
    rowVersions: Object.fromEntries(
      [
        ...new Set(
          reports.flatMap(([, data]) => Object.keys(data.rowVersions || {}).map(Number)),
        ),
      ].map((id) => [id, Math.max(...reports.map(([, data]) => data.rowVersions?.[id] || 0))]),
    ),
    activity: Object.assign({}, ...reports.map(([, data]) => data.activity || {})),
  };
}
async function loadRecords(background = false) {
  background = background === true;
  if (!state.config || (background && state.refreshing)) return;
  state.refreshing = true;
  $('#refresh-now').disabled = true;
  const seq = ++state.sequence;
  if (!background) {
    state.loading = true;
    state.records.clear();
    state.dailyReport = null;
    render();
  }
  state.connection = 'syncing';
  $('#error-banner').hidden = true;
  updateConnection();
  try {
    const scope = reportScope();
    const shifts = hasWholeDayScope() ? ['day', 'night'] : [scope];
    const reports = await Promise.all(
      shifts.map(async (shift) => {
        const data = await api(`/api/records?date=${state.date}&shift=${shift}`);
        if (!data.defaults) {
          const defaults = await api(`/api/defaults?date=${state.date}&shift=${shift}`);
          data.defaults = defaults.rows || defaults.defaults || defaults;
        }
        return [shift, data];
      }),
    );
    if (new Set(reports.map(([, data]) => data.configVersion)).size > 1)
      throw new Error(t('configChanged'));
    const dailyReport = reports.length === 2 ? combineShiftReports(reports) : null;
    const data = scope === 'all' ? dailyReport : reports.find(([shift]) => shift === scope)[1];
    if (seq !== state.sequence) return;
    if (data.configVersion !== state.config.version) {
      state.config = await api('/api/config');
      if (seq !== state.sequence) return;
    }
    state.dailyReport = dailyReport;
    state.defaults = data.defaults || {};
    state.records = new Map(data.records.map((r) => [r.rowId, r]));
    state.rowVersions = data.rowVersions || {};
    state.activity = data.activity || {};
    state.serverOffset = (data.serverTime || Date.now()) - Date.now();
    state.loadedScope = `${state.date}|${scope}`;
    state.loading = false;
    state.connection = 'connected';
    state.lastTime = Date.now();
    populateLineFilters();
    render();
    updateConnection();
  } catch (error) {
    if (seq !== state.sequence) return;
    state.connection = 'offline';
    if (!background) {
      state.loading = true;
      state.records.clear();
    }
    render();
    updateConnection();
    showError('#error-banner', error);
  } finally {
    if (seq === state.sequence) {
      state.refreshing = false;
      $('#refresh-now').disabled = false;
      configureAutoRefresh();
    }
  }
}
function render() {
  if (!state.config) return;
  $('#line-dashboard').hidden = state.view !== 'overview';
  $('#entry-content').hidden = state.view !== 'entry';
  if (state.view === 'entry') entryController?.render();
  if (state.view === 'help')
    $('#help-content').innerHTML = helpMarkup({
      role: state.user.role,
      language: state.language,
      t,
      esc,
      icon,
    });
  $('.records-panel').hidden = state.view !== 'details';
  $('#detail-heading').hidden = state.view !== 'details';
  $('#detail-filters').hidden = state.view !== 'details';
  $('#board-context').textContent =
    state.date + ' / ' + t(reportScope() === 'all' ? 'overviewAll' : reportScope());
  renderVisuals();
  renderSlotTabs();
  renderTable();
  $('#export').disabled = state.loading;
}
function renderVisuals() {
  const breaks = schedule().filter((s) => s.kind === 'break');
  $('#break-summary').textContent = breaks.length
    ? t('breakSummary', { times: breaks.map(label).join(' / ') })
    : t('noBreak');
  renderChart();
}
// Planned targets are visible before an operator enters actual output. Saved snapshots win.
function monitorRecords(saved = state.records, defaults = state.defaults) {
  const records = [...saved.values()];
  for (const row of state.config.rows.filter((r) => r.active && !saved.has(r.id))) {
    const initial = defaults[row.id];
    if (initial)
      records.push({
        ...initial,
        rowId: row.id,
        slots: (initial.slots || []).map((s) => ({
          ...s,
          actual: s.lineShared ? s.actual : null,
          issue: '',
        })),
      });
  }
  return records;
}
function monitorContext() {
  const scope = reportScope();
  const config = {
    ...state.config,
    schedules: {
      ...state.config.schedules,
      all: [...state.config.schedules.day, ...state.config.schedules.night],
    },
  };
  return {
    config,
    records: monitorRecords(),
    dailyRecords: state.dailyReport
      ? monitorRecords(
          new Map(state.dailyReport.records.map((record) => [record.rowId, record])),
          state.dailyReport.defaults,
        )
      : null,
    date: state.date,
    shift: scope,
    activity: state.activity,
    now: Date.now() + state.serverOffset,
    groupId: state.view === 'details' ? state.detailGroupId : state.groupId,
    detail: state.view === 'details',
    board: document.body.classList.contains('fullscreen-board'),
    boardPage: state.boardPage,
    boardSize: 7,
    alertFilter: state.view === 'overview' ? state.alertFilter || 'all' : 'all',
    metricScope: stored('bp-metric-scope') === 'day' ? 'day' : 'interval',
    chartLine: state.view === 'details' ? state.line : state.chartLine,
    t,
    esc,
    number,
    icon,
  };
}
function renderChart() {
  hideTrendTooltip();
  $('#overview-panels').hidden = state.view !== 'details';
  const detailUnit = detailUnits().find((unit) => productionKey(unit) === state.line);
  $('#detail-line-title').innerHTML = detailUnit
    ? productionIdentityMarkup(detailUnit, esc, { singleLine: true })
    : esc(
        state.config.monitoring.groups.find((g) => g.id === state.detailGroupId)?.name ||
          t('allLines'),
      );
  applyBoardDisplay();
  for (const button of document.querySelectorAll('[data-metric-scope]')) {
    const selected =
      button.dataset.metricScope === (stored('bp-metric-scope') === 'day' ? 'day' : 'interval');
    button.setAttribute('aria-pressed', String(selected));
  }
  if (state.config?.monitoring) renderMonitoring(monitorContext());
  updateCurrentInterval();
}
function renderSlotTabs() {
  const slots = allSlots();
  if (!slots.some((s) => s.id === state.slotId)) state.slotId = slots[0]?.id || '';
  let html = '';
  for (const s of schedule()) {
    if (s.kind === 'break')
      html += `<span class="break-label">${esc(t('break'))} ${label(s)}</span>`;
    else html += slotTab(s, false);
  }
  for (const s of slots.filter((s) => s.historical)) html += slotTab(s, true);
  $('#slot-tabs').innerHTML = html;
}
function slotTab(s, historical) {
  const selected = s.id === state.slotId;
  return `<button role="tab" aria-selected="${selected}" tabindex="${selected ? 0 : -1}" data-slot="${esc(s.id)}" class="slot-tab ${selected ? 'selected' : ''}">${label(s)}${overnight(s) ? `<sup>+1</sup>` : ''}<small>${esc(historical ? t('archived') : t('minutes', { count: duration(s) }))}</small></button>`;
}
function filteredRows() {
  return getRows().filter((row) => {
    const r = state.records.get(row.id),
      s = measurement(r);
    if (
      (state.status === 'filled' && !hasData(s)) ||
      (state.status === 'pending' && (hasData(s) || !stationHasOutput(row, state.config))) ||
      (state.status === 'issue' && !s?.issue)
    )
      return false;
    return (
      !state.search ||
      [
        row.line,
        modelOf(row),
        row.job,
        row.station,
        r?.owner,
        r?.dayTeam,
        r?.nightTeam,
        s?.issue,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(state.search.toLocaleLowerCase())
    );
  });
}
function gapHtml(target, actual) {
  const gap = target != null && actual != null ? actual - target : null;
  return `<span class="${gap < 0 ? 'negative' : gap > 0 ? 'positive' : 'muted'}">${gap > 0 ? '+' : ''}${number(gap)}</span>`;
}
function renderTable() {
  if (state.loading) {
    $('#records-body').innerHTML =
      `<tr><td colspan="9" class="empty-cell">${esc(t(state.connection === 'offline' ? 'loadFailed' : 'loading'))}</td></tr>`;
    $('#table-summary').textContent = t('loading');
    $('#previous-page').disabled = true;
    $('#next-page').disabled = true;
    return;
  }
  const rows = filteredRows(),
    pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * state.pageSize;
  $('#row-count').textContent = number(rows.length);
  $('#records-body').innerHTML =
    rows
      .slice(start, start + state.pageSize)
      .map((row) => {
        const r = state.records.get(row.id),
          s =
            measurement(r) || state.defaults[row.id]?.slots.find((s) => s.id === state.slotId),
          status = !stationHasOutput(row, state.config)
            ? 'noOutput'
            : s?.issue
              ? 'issue'
              : hasData(s)
                ? 'filled'
                : 'pending',
          archived = !state.config.rows.find((v) => v.id === row.id)?.active;
        const staffShift = reportScope() === 'all' ? s?.shift || state.shift : state.shift;
        const assigned = personnelNames(
          r || state.defaults[row.id],
          staffShift,
          (staffShift === 'day' ? r?.dayTeam : r?.nightTeam) ||
            state.defaults[row.id]?.[staffShift === 'day' ? 'dayTeam' : 'nightTeam'],
        );
        return `<tr><td class="entry-cell" data-label="${esc(t('actions'))}"><button class="edit-button" ${stationHasOutput(row, state.config) ? '' : 'disabled'} data-edit="${row.id}" aria-label="${esc(t('edit'))} ${esc(row.line)} ${esc(row.station || row.job)}">${icon('edit')}${esc(t(stationHasOutput(row, state.config) ? (r ? 'edit' : 'enter') : 'noOutput'))}</button></td><td data-label="${esc(t('lineStation'))}"><div class="station-cell"><span class="station-details">${productionIdentityMarkup(row, esc)}<small>${esc(row.station ? t('stationLabel', { name: row.station }) : t('noStation'))}${archived ? ' · ' + esc(t('archived')) : ''}</small></span></div></td><td data-label="${esc(t('job'))}">${row.job ? `<span class="job-tag" title="${esc(row.job)}">${esc(row.job)}</span>` : '—'}</td><td data-label="${esc(t('assignedStaff'))}" class="team-cell" tabindex="0" title="${esc(assigned.join('\n'))}"><span class="team-day">${assigned.map((name) => '<span class="person-name">' + esc(name) + '</span>').join('') || '—'}</span></td><td data-label="${esc(t('target'))}" class="number ${s?.target == null ? 'muted' : ''}">${number(s?.target)}</td><td data-label="${esc(t('actual'))}" class="number ${s?.actual == null ? 'muted' : ''}">${number(s?.actual)}</td><td data-label="${esc(t('gap'))}" class="number">${gapHtml(s?.target, s?.actual)}</td><td data-label="${esc(t('issueOwner'))}" class="issue-cell" tabindex="0" title="${esc(t('issue') + ': ' + (s?.issue || '\u2014') + '\n' + t('owner') + ': ' + (r?.owner || '\u2014'))}">${s?.issue ? `<span class="issue-text" title="${esc(s.issue)}">${esc(s.issue)}</span>` : '<span class="muted">—</span>'}${(r ? r.owner : state.defaults[row.id]?.owner) ? `<small class="issue-owner" title="${esc(r?.owner || state.defaults[row.id]?.owner)}">${esc(r?.owner || state.defaults[row.id]?.owner)}</small>` : ''}</td><td data-label="${esc(t('status'))}"><span class="status-tag ${status}"><i></i>${esc(t(status === 'issue' ? 'hasIssue' : status))}</span></td></tr>`;
      })
      .join('') ||
    `<tr><td colspan="9" class="empty-cell"><strong>${esc(t('noResults'))}</strong><span>${esc(t('noResultsDesc'))}</span></td></tr>`;
  $('#table-summary').textContent =
    t('tableSummary', {
      start: rows.length ? start + 1 : 0,
      end: Math.min(start + state.pageSize, rows.length),
      total: rows.length,
    }) +
    ' · ' +
    t('gapFormula');
  $('#page-indicator').textContent = `${state.page} / ${pages}`;
  $('#previous-page').disabled = state.page === 1;
  $('#next-page').disabled = state.page >= pages;
}
function confirmText(title, description, yes, no) {
  $('#confirm-title').textContent = title;
  $('#confirm-description').textContent = description;
  $('#confirm-yes').textContent = yes;
  $('#confirm-no').textContent = no;
  $('#confirm-dialog').showModal();
  return new Promise((resolve) => (confirmResolve = resolve));
}
function confirmAction(
  title,
  description,
  yes = 'confirm',
  no = 'continueEditing',
  params = {},
) {
  return confirmText(t(title), t(description, params), t(yes), t(no));
}
function finishConfirm(value) {
  $('#confirm-dialog').close();
  confirmResolve?.(value);
  confirmResolve = null;
}
$('#confirm-yes').onclick = () => finishConfirm(true);
$('#confirm-no').onclick = () => finishConfirm(false);
$('#confirm-dialog').addEventListener('cancel', (e) => {
  e.preventDefault();
  finishConfirm(false);
});
function updateSettingsSaveState() {
  const issueListValid = !state.draft || validateIssuePresets(issuePresets(state.draft));
  const policiesValid =
    !state.draft ||
    (validAlertConfig(state.draft.monitoring) &&
      [...document.querySelectorAll('[data-policy-field]')].every(
        (input) => input.validity.valid,
      ));
  const status = settingsSaving
    ? 'saving'
    : !issueListValid
      ? 'errIssuePresets'
      : !policiesValid
        ? 'errMonitoring'
        : localSettingsDraftSaved() && settingsDirty()
          ? 'settingsDraftSaved'
          : settingsDirty()
            ? 'settingsUnsaved'
            : 'settingsUpToDate';
  $('#settings-save-status').textContent = t(status);
  const scheduleStatus = $('[data-schedule-save-state]');
  if (scheduleStatus) {
    scheduleStatus.textContent = t(status);
    scheduleStatus.dataset.unsaved = String(settingsDirty());
  }
  for (const button of $$('[data-save-settings]')) {
    button.disabled = settingsSaving || !issueListValid || !policiesValid;
    button.innerHTML = icon('check') + esc(t(settingsSaving ? 'saving' : 'saveSettings'));
  }
  for (const button of $$('[data-save-draft]')) button.disabled = settingsSaving;
  $('#reload-settings').disabled = settingsSaving;
  const note = $('#settings-draft-note');
  note.textContent = t(
    state.draft?.version !== state.config?.version
      ? 'settingsDraftConflict'
      : 'settingsDraftHint',
  );
}
function settingsDirty() {
  return !!state.draft && JSON.stringify(state.draft) !== settingsSnapshot;
}
let localDraftSnapshot = '';
function localSettingsDraftSaved() {
  return !!state.draft && JSON.stringify(state.draft) === localDraftSnapshot;
}
function settingsNeedProtection() {
  return settingsDirty() && !localSettingsDraftSaved();
}
function settingsDraftKey() {
  return `bp-settings-draft:${state.user.username}`;
}
function beginSettingsDraft() {
  state.draft = structuredClone(state.config);
  settingsSnapshot = JSON.stringify(state.draft);
  localDraftSnapshot = '';
  try {
    const saved = JSON.parse(stored(settingsDraftKey()) || 'null');
    const draft = saved?.draft;
    // Check the browser-storage envelope before using it as a renderable draft.
    if (
      draft &&
      typeof saved.baseline === 'string' &&
      Number.isInteger(draft.version) &&
      ['lines', 'jobs', 'stations', 'rows', 'personnel'].every((key) =>
        Array.isArray(draft[key]),
      ) &&
      ['day', 'night'].every((key) => Array.isArray(draft.schedules?.[key])) &&
      Array.isArray(draft.monitoring?.groups) &&
      Array.isArray(draft.monitoring?.rules)
    ) {
      state.draft = draft;
      settingsSnapshot = saved.baseline;
      localDraftSnapshot = JSON.stringify(draft);
    }
  } catch {}
  // Filters and batch pairs are UI state, never fields in the shared configuration.
  state.mappingLine = null;
  state.mappingModel = '';
  state.unitFilterLine = '';
  state.unitAdd = { line: '', model: '' };
  state.staffingLine = null;
  state.staffingModel = '';
  state.staffChoices = {};
  state.targetLine = null;
  state.personJob = null;
  state.mappingBatch = [{ job: '', station: '' }];
}
async function setView(view, options = {}) {
  if (!state.config || !state.user || !pagePath(view)) return false;
  if (!(await entryController?.canLeave())) {
    toast(t('resolveEntryChanges'));
    return false;
  }
  if (view === 'settings' && !canManage()) {
    toast(t('errForbidden'));
    return false;
  }
  if (
    state.view === 'settings' &&
    view !== 'settings' &&
    settingsNeedProtection() &&
    !(await confirmAction('discardTitle', 'discardDesc', 'discard'))
  )
    return false;
  if (settingsSaving) return false;
  if (view !== 'overview') await leaveFullscreen();
  state.view = view;
  if (view === 'settings' && options.tab) state.settingsTab = options.tab;
  state.page = 1;
  state.status = 'all';
  $('#status-select').value = 'all';
  if (view === 'settings' && !state.draft) {
    beginSettingsDraft();
  } else if (view !== 'settings') {
    state.draft = null;
  }
  if (options.history !== false) syncPageAddress();
  updateHeadings();
  if (view === 'settings') renderSettings();
  else if (
    view !== 'help' &&
    (state.loadedScope !== `${state.date}|${reportScope()}` ||
      (hasWholeDayScope() && !state.dailyReport))
  )
    await loadRecords();
  else render();
  return true;
}
// Settings drafts stay local until Save; the server validates and atomically stores the whole configuration.
function showSettingsError(error) {
  showError('#settings-error', error);
  $('#settings-error').scrollIntoView({ block: 'nearest' });
}

/** All routes use the same dependency check, including shortcuts outside Settings. */
function settingsStepName(key) {
  return t(setupTitleKeys[key] || key);
}
function setupBlockedReason(access) {
  return t('setupBlockedReason', {
    steps: access.missing
      .map((key) => `${setupSteps.indexOf(key) + 1}. ${settingsStepName(key)}`)
      .join(', '),
  });
}
function openSettingsStep(key) {
  if (!state.draft || settingsSaving || !setupSteps.includes(key)) return;
  const access = setupAccess(state.draft)[key];
  if (!access.enabled) return toast(setupBlockedReason(access));
  state.settingsTab = key;
  syncPageAddress();
  renderSettings();
}
const setupStepMarkup = new WeakMap();
function renderSetupProgress() {
  if (!state.draft) return;
  const ready = setupReadiness(state.draft);
  const access = setupAccess(state.draft);
  const current = setupSteps.indexOf(state.settingsTab);
  const completed = setupSteps.filter((key) => ready[key]).length;
  $('#setup-progress').innerHTML =
    `<div><strong>${esc(t('setupSequence'))}</strong><span>${esc(t('setupCompletion', { count: completed, total: setupSteps.length }))}</span></div>
    <p>${esc(t('setupSequenceHint'))}</p>`;
  for (const [index, key] of setupSteps.entries()) {
    const button = $(`[data-settings-tab="${key}"]`);
    const status = t(ready[key] ? 'stepReady' : 'stepPending');
    button.disabled = settingsSaving || !access[key].enabled;
    button.setAttribute('aria-disabled', String(button.disabled));
    button.title = access[key].enabled ? status : setupBlockedReason(access[key]);
    const markup = `<span class="step-number">${index + 1}</span><span>${esc(settingsStepName(key))}</span>
      <span class="step-state ${ready[key] ? 'is-ready' : ''}" aria-hidden="true">${ready[key] ? '&#10003;' : '&#183;'}</span>`;
    // A blur event can run between pointer down/up on a navigation label.
    // Keep identical children so the first click still reaches its anchor.
    if (setupStepMarkup.get(button) !== markup) {
      button.innerHTML = markup;
      setupStepMarkup.set(button, markup);
    }
    button.setAttribute(
      'aria-label',
      t('stepLabel', { step: index + 1, name: settingsStepName(key), status }) +
        (access[key].enabled ? '' : ` · ${setupBlockedReason(access[key])}`),
    );
  }
  const next = setupSteps[current + 1];
  const nextButton = $('#setup-next');
  nextButton.hidden = !next;
  nextButton.dataset.nextStep = next || '';
  nextButton.disabled = settingsSaving || (!!next && !access[next].enabled);
  nextButton.textContent = next ? t('nextSetupStep', { name: settingsStepName(next) }) : '';
  const reason = next
    ? access[next].enabled
      ? t('setupNextReady')
      : setupBlockedReason(access[next])
    : t('setupLastStep');
  nextButton.title = reason;
  $('#setup-next-reason').textContent = reason;
}
$('#setup-next').onclick = () => {
  openSettingsStep($('#setup-next').dataset.nextStep);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/** Pending checkbox choices are local UI state. Only Add selected changes the
 * settings draft; clearing ticks never removes already assigned colleagues. */
function updateStaffSelection(field) {
  const checkboxes = [...field.querySelectorAll('[data-staff-person]')];
  const people = checkboxes.filter((input) => input.checked).map((input) => input.value);
  const key = JSON.stringify([field.dataset.staffUnit, field.dataset.staffRole]);
  state.staffChoices[key] = { job: field.querySelector('[data-staff-job]').value, people };
  field.querySelector('[data-staff-selection-count]').textContent = t('selectedPeopleCount', {
    count: people.length,
  });
  field.querySelector('[data-staff-add-label]').textContent = t('addStaffSelected', {
    count: people.length,
  });
  field.querySelector('[data-action="add-staff-person"]').disabled = !people.length;
  field.querySelector('[data-action="staff-select-all"]').disabled =
    people.length === checkboxes.length;
  field.querySelector('[data-action="staff-clear-selection"]').disabled = !people.length;
}

function renderSettings() {
  if (!state.draft || !canManage()) return;
  const access = setupAccess(state.draft);
  if (!access[state.settingsTab]?.enabled) {
    const missing = access[state.settingsTab]?.missing || ['structure'];
    state.settingsTab = missing[0];
    syncPageAddress(true);
  }
  const mappingUnit = mappingSelection(state.draft, state.mappingLine, state.mappingModel);
  state.mappingLine = mappingUnit?.line || null;
  state.mappingModel = mappingUnit?.model || null;
  if (state.targetLine !== '' && !state.draft.lines.includes(state.targetLine))
    state.targetLine = productionUnits(state.draft)[0]?.line || state.draft.lines[0] || '';
  updateSettingsNavigation();
  renderSetupProgress();
  $$('[data-settings-tab]').forEach((button) => {
    const selected = button.dataset.settingsTab === state.settingsTab;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', String(selected));
    button.setAttribute('aria-controls', 'settings-body');
    button.tabIndex = selected && !button.disabled ? 0 : -1;
  });
  const context = { draft: state.draft, t, esc, icon, language: state.language };
  const markup = {
    structure: () => structureMarkup() + issueSettingsMarkup(context) + scheduleMarkup(),
    personnel: () => workforceSettingsMarkup({ ...context, selectedJob: state.personJob }),
    staffing: () =>
      lineStaffingMarkup({
        ...context,
        selectedLine: state.staffingLine,
        selectedModel: state.staffingModel,
        choices: state.staffChoices,
      }),
    workforce: () =>
      staffSettingsMarkup({
        ...context,
        selectedLine: state.mappingLine,
        selectedModel: state.mappingModel,
        batchPairs: state.mappingBatch,
      }),
    targets: () => targetsSettingsMarkup({ ...context, selectedLine: state.targetLine }),
    groups: () => groupSettings(context),
    alerts: () => alertSettings(context),
    appearance: () => appearanceMarkup(),
  };
  $('#settings-body').innerHTML = markup[state.settingsTab]();
  $('#settings-body').setAttribute('aria-label', settingsStepName(state.settingsTab));
  syncSchedulePicker();
  updateSettingsSaveState();
}
function syncSchedulePicker() {
  updateLinePicker($('#schedule-line-picker'), state.draft, state.scheduleApplyLines, {
    t,
    language: state.language,
  });
}
function structureMarkup() {
  const draft = state.draft;
  return `<div class="settings-section-heading"><div><h2>${esc(t('catalogsTitle'))}</h2><p>${esc(t('catalogsDesc'))}</p></div></div>
    <div class="catalog-grid">${['lines', 'models', 'jobs', 'stations']
      .map(
        (name) => `<section class="panel catalog-card">
      <div class="panel-heading"><h3>${esc(t(name))}</h3><span class="count-badge">${draft[name].length}</span></div>
      <div class="catalog-items">${naturalOrder(
        draft[name].map((value, index) => ({ value, index })),
        state.language,
        (item) => item.value,
      )
        .map(
          ({ value, index }) => `<div class="catalog-item">
        <input maxlength="60" data-catalog-name="${name}" data-index="${index}" value="${esc(value)}" aria-label="${esc(t('rename'))} ${esc(value)}">
        <button class="icon-button" data-action="remove-catalog" data-catalog="${name}" data-index="${index}" aria-label="${esc(t('remove'))} ${esc(value)}">${icon('close')}</button>
      </div>`,
        )
        .join('')}</div>
      <div class="catalog-add">
        <input id="new-${name}" maxlength="60" placeholder="${esc(t('addName'))}" aria-label="${esc(t('add'))} ${esc(t(name))}">
        <button class="button" data-action="add-catalog" data-catalog="${name}">${icon('plus')}${esc(t('add'))}</button>
      </div>
    </section>`,
      )
      .join(
        '',
      )}</div>${lineModelsMarkup({ draft, esc, icon, language: state.language, selectedLine: state.unitFilterLine, addLine: state.unitAdd.line, addModel: state.unitAdd.model })}`;
}
// Editing an inherited line creates its own copy on first change; selecting a
// line alone never mutates the shared template or another line's draft.
function scheduleDraft(edit = false) {
  if (!state.draft.lines.includes(state.scheduleLine)) state.scheduleLine = '';
  if (!scheduleTemplate(state.draft, state.scheduleTemplateId))
    state.scheduleTemplateId = 'default';
  if (!state.scheduleLine)
    return edit
      ? editScheduleTemplate(state.draft, state.scheduleTemplateId)
      : scheduleTemplate(state.draft, state.scheduleTemplateId).schedules;
  const overrides =
    state.draft.lineSchedules ||
    (edit ? (state.draft.lineSchedules = Object.create(null)) : {});
  if (edit && !Object.hasOwn(overrides, state.scheduleLine))
    Object.defineProperty(overrides, state.scheduleLine, {
      value: structuredClone(state.draft.schedules),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return Object.hasOwn(overrides, state.scheduleLine)
    ? overrides[state.scheduleLine]
    : state.draft.schedules;
}

// Schedules are part of the master-data step; existing time IDs are sent unchanged.
function scheduleMarkup() {
  const schedules = scheduleDraft();
  state.scheduleApplyLines = state.scheduleApplyLines.filter((line) =>
    state.draft.lines.includes(line),
  );
  const custom = Object.hasOwn(state.draft.lineSchedules || {}, state.scheduleLine);
  return `<section id="structure-schedule" class="schedule-settings"><div class="settings-section-heading"><div><h2>${esc(t('scheduleTitle'))}</h2><p>${esc(t('scheduleDesc'))}</p></div></div>
    <section class="panel schedule-template-tools">
      <label>${esc(t('savedScheduleTemplates'))}<select id="schedule-template-select">
        <option value="default">${esc(t('scheduleTemplate'))}</option>
        ${naturalOrder(
          state.draft.scheduleTemplates || [],
          state.language,
          (template) => template.name,
        )
          .map(
            (template) =>
              `<option value="${esc(template.id)}" ${template.id === state.scheduleTemplateId ? 'selected' : ''}>${esc(template.name)}</option>`,
          )
          .join('')}
      </select></label>
      <label>${esc(t('templateName'))}<input id="schedule-template-name" maxlength="60" value="${state.scheduleTemplateId === 'default' ? '' : esc(scheduleTemplate(state.draft, state.scheduleTemplateId)?.name || '')}" placeholder="${esc(t('templateName'))}"></label>
      <button class="button" data-action="add-schedule-template">${esc(t('newScheduleTemplate'))}</button>
      <button class="button" data-action="rename-schedule-template" ${state.scheduleTemplateId === 'default' ? 'disabled' : ''}>${esc(t('rename'))}</button>
      <button class="button" data-action="delete-schedule-template" ${state.scheduleTemplateId === 'default' ? 'disabled' : ''}>${esc(t('remove'))}</button>
    </section>
    <section class="panel schedule-scope">
      <label>${esc(t('scheduleScope'))}<select id="schedule-line-select">
        <option value="">${esc(t('editSelectedTemplate'))}</option>
        ${naturalOrder(state.draft.lines, state.language)
          .map(
            (line) =>
              `<option value="${esc(line)}" ${state.scheduleLine === line ? 'selected' : ''}>${esc(line)}</option>`,
          )
          .join('')}
      </select></label>
      <span class="muted">${esc(t(state.scheduleLine ? (custom ? 'scheduleCustom' : 'scheduleInherited') : 'scheduleTemplateHint'))}</span>
      ${state.scheduleLine ? `<div><button class="button" data-action="copy-schedule-template">${esc(t('copyScheduleTemplate'))}</button><button class="button" data-action="inherit-schedule" ${custom ? '' : 'disabled'}>${esc(t('inheritSchedule'))}</button></div>` : ''}
    </section>
    ${schedulePreview(state.draft, schedules, state.scheduleLine, { t, esc, previewKey: state.schedulePreviewKey })}
    <div class="schedule-grid">${['day', 'night']
      .map(
        (shift) => `<section class="panel schedule-card">
      <div class="panel-heading"><h3>${icon(shift === 'day' ? 'sun' : 'moon')}${esc(t(shift))}</h3><span class="count-badge">${schedules[shift].length}</span></div>
      <div class="schedule-items">${schedules[shift]
        .map(
          (
            slot,
            index,
          ) => `<div class="schedule-item ${slot.kind === 'break' ? 'is-break' : ''}">
        <div class="schedule-item-top">
          <select data-time-field="kind" data-shift-key="${shift}" data-index="${index}" aria-label="${esc(t('type'))}">
            <option value="production" ${slot.kind === 'production' ? 'selected' : ''}>${esc(t('production'))}</option>
            <option value="break" ${slot.kind === 'break' ? 'selected' : ''}>${esc(t('break'))}</option>
          </select>
          <select data-move-shift="${shift}" data-index="${index}" aria-label="${esc(t('shift'))}">
            <option value="day" ${shift === 'day' ? 'selected' : ''}>${esc(t('day'))}</option>
            <option value="night" ${shift === 'night' ? 'selected' : ''}>${esc(t('night'))}</option>
          </select>
          <span class="schedule-duration">${esc(t('minutes', { count: duration(slot) }))}${overnight(slot) ? ' · ' + esc(t('overnight')) : ''}</span>
          <div class="schedule-actions">
            <button class="icon-button" data-action="slot-up" data-shift-key="${shift}" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="${esc(t('moveUp'))}">${icon('up')}</button>
            <button class="icon-button" data-action="slot-down" data-shift-key="${shift}" data-index="${index}" ${index === schedules[shift].length - 1 ? 'disabled' : ''} aria-label="${esc(t('moveDown'))}">${icon('down')}</button>
            <button class="icon-button" data-action="remove-slot" data-shift-key="${shift}" data-index="${index}" aria-label="${esc(t('remove'))} ${esc(label(slot))}">${icon('trash')}</button>
          </div>
        </div>
        <div class="schedule-time-fields">
          <label>${esc(t('start'))}<input type="time" value="${esc(slot.start)}" data-time-field="start" data-shift-key="${shift}" data-index="${index}" required></label>
          <span>→</span>
          <label>${esc(t('end'))}<input type="time" value="${esc(slot.end)}" data-time-field="end" data-shift-key="${shift}" data-index="${index}" required></label>
        </div>
      </div>`,
        )
        .join('')}</div>
      <div class="schedule-add">
        <button class="button" data-action="add-slot" data-shift-key="${shift}" data-kind="production">${icon('plus')}${esc(t('addSlot'))}</button>
        <button class="button" data-action="add-slot" data-shift-key="${shift}" data-kind="break">${icon('plus')}${esc(t('addBreak'))}</button>
      </div>
    </section>`,
      )
      .join('')}</div>
    ${
      !state.scheduleLine
        ? `<fieldset class="panel schedule-apply"><legend>${esc(t('applyTemplateLines'))}</legend>
      ${linePickerMarkup(state.draft, state.scheduleApplyLines, { t, esc, language: state.language })}
      <div class="schedule-apply-actions"><button class="button" data-action="apply-schedule-template" ${state.scheduleApplyLines.length ? '' : 'disabled'}>${esc(t('applySelectedTemplate', { count: state.scheduleApplyLines.length }))}</button><button class="button primary" data-save-settings data-action="save-schedule-settings">${esc(t('saveSettings'))}</button><span class="schedule-save-state" data-schedule-save-state role="status"></span></div>
      <p class="form-hint">${esc(t('templateApplyHint'))}</p>
    </fieldset>`
        : ''
    }
    <div class="calculation-note">${icon('info')}<span>${esc(t('scheduleProtect'))}</span></div></section>`;
}
function appearanceMarkup() {
  return `<div class="settings-section-heading"><div><h2>${esc(t('appearanceTitle'))}</h2><p>${esc(t('appearanceDesc'))}</p></div></div><section class="panel appearance-card"><h3>${esc(t('defaultTheme'))}</h3><div class="theme-options">${naturalOrder(
    themes,
    state.language,
    (theme) => t(theme),
  )
    .map(
      (theme) =>
        `<button class="theme-option ${state.draft.theme === theme ? 'selected' : ''}" data-action="default-theme" data-theme-name="${theme}" aria-pressed="${state.draft.theme === theme}"><span class="swatch swatch-${theme}">${state.draft.theme === theme ? icon('check') : ''}</span><strong>${esc(t(theme))}</strong></button>`,
    )
    .join(
      '',
    )}</div><div class="appearance-fields"><label>${esc(t('defaultLanguage'))}<select id="default-language"><option value="zh" ${state.draft.language === 'zh' ? 'selected' : ''}>Chinese</option><option value="en" ${state.draft.language === 'en' ? 'selected' : ''}>English</option><option value="th" ${state.draft.language === 'th' ? 'selected' : ''}>Thai</option></select></label><div><span>${esc(t('browserPrefs'))}</span><button class="button" data-action="use-defaults">${icon('refresh')}${esc(t('useDefaults'))}</button></div></div><div class="theme-preview" data-theme="${state.draft.theme}"><span class="preview-icon">BP</span><div><strong>BP PULSE · ${esc(t('preview'))}</strong><p>${esc(t('previewDesc'))}</p></div><span class="preview-check">${icon('check')}</span></div></section>`;
}
function renameCatalog(catalog, index, value) {
  const old = state.draft[catalog][index],
    name = value.trim();
  if (
    !name ||
    state.draft[catalog].some(
      (s, i) => i !== index && s.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  ) {
    toast(t('errDuplicate'));
    return false;
  }
  if (!renameCatalogItem(state.draft, catalog, old, name)) return false;
  const field = { lines: 'line', models: 'model', jobs: 'job', stations: 'station' }[catalog];
  for (const pair of state.mappingBatch) if (pair[field] === old) pair[field] = name;
  if (catalog === 'jobs' && state.personJob === old) state.personJob = name;
  if (['jobs', 'lines', 'models'].includes(catalog)) {
    // Filter choices are UI state, but must follow the same catalog rename as
    // directory people and units. Retain pending IDs rather than losing ticks.
    state.staffChoices = Object.fromEntries(
      Object.entries(state.staffChoices).map(([key, choice]) => {
        const [unitKey, role] = JSON.parse(key);
        const [line, model] = JSON.parse(unitKey);
        const unit = {
          line: catalog === 'lines' && line === old ? name : line,
          model: catalog === 'models' && model === old ? name : model,
        };
        return [
          JSON.stringify([productionKey(unit), role]),
          { ...choice, job: catalog === 'jobs' && choice.job === old ? name : choice.job },
        ];
      }),
    );
  }
  if (state.unitAdd[field] === old) state.unitAdd[field] = name;
  if (state.schedulePreviewKey && ['lines', 'models'].includes(catalog)) {
    const [line, model] = JSON.parse(state.schedulePreviewKey);
    state.schedulePreviewKey = productionKey({
      line: catalog === 'lines' && line === old ? name : line,
      model: catalog === 'models' && model === old ? name : model,
    });
  }
  if (catalog === 'models' && state.mappingModel === old) state.mappingModel = name;
  if (catalog === 'models' && state.staffingModel === old) state.staffingModel = name;
  if (catalog === 'lines') {
    state.scheduleApplyLines = state.scheduleApplyLines.map((line) =>
      line === old ? name : line,
    );
    if (state.scheduleLine === old) state.scheduleLine = name;
    if (state.mappingLine === old) state.mappingLine = name;
    if (state.targetLine === old) state.targetLine = name;
    if (state.unitFilterLine === old) state.unitFilterLine = name;
    if (state.staffingLine === old) state.staffingLine = name;
  }
  return true;
}

$('#settings-body').addEventListener('input', (event) => {
  if (event.target.matches('[data-line-picker-search]')) {
    syncSchedulePicker();
    return;
  }
  if (settingsSaving || !canManage() || !state.draft) return;
  // Capture text/target edits immediately so leaving or saving while focused is safe.
  const data = event.target.dataset;
  if (data.issueLabel !== undefined) {
    state.draft.issuePresets = structuredClone(issuePresets(state.draft));
    const item = state.draft.issuePresets[Number(data.issueIndex)];
    item.label = event.target.value;
    updateSettingsSaveState();
    return;
  }
  if (data.personField === 'name' || data.lineTarget !== undefined) {
    handleWorkforceChange(state.draft, event.target);
    updateSettingsSaveState();
    renderSetupProgress();
  }
});
$('#settings-body').addEventListener('change', async (e) => {
  if (settingsSaving || !canManage() || !state.draft) return;
  const el = e.target,
    d = el.dataset;
  if (d.issueEnabled !== undefined) {
    state.draft.issuePresets = structuredClone(issuePresets(state.draft));
    state.draft.issuePresets[Number(d.issueEnabled)].active = el.checked;
    updateSettingsSaveState();
    return;
  }
  if (d.unitAddLine !== undefined || d.unitAddModel !== undefined) {
    const unit = {
      line: $('[data-unit-add-line]').value,
      model: $('[data-unit-add-model]').value,
    };
    state.unitAdd = unit;
    const duplicate = !!unit.line && !!unit.model && !!unitFor(state.draft, unit);
    $('[data-action="add-unit"]').disabled = !unit.line || !unit.model || duplicate;
    $('[data-unit-add-status]').textContent = duplicate ? t('combinationExists') : '';
    return;
  }
  if (d.unitFilterLine !== undefined) {
    state.unitFilterLine = el.value;
    renderSettings();
    $('[data-unit-filter-line]').focus();
    return;
  }
  if (d.staffingLineFilter !== undefined || d.staffingModelFilter !== undefined) {
    if (d.staffingLineFilter !== undefined) {
      state.staffingLine = el.value;
      state.staffingModel = '';
    } else state.staffingModel = el.value;
    renderSettings();
    $(
      d.staffingLineFilter !== undefined
        ? '[data-staffing-line-filter]'
        : '[data-staffing-model-filter]',
    ).focus();
    return;
  }
  if (d.staffJob !== undefined || d.staffPerson !== undefined) {
    const field = el.closest('[data-staff-unit]');
    const job = field.querySelector('[data-staff-job]').value;
    if (d.staffJob !== undefined) {
      const [line, model] = JSON.parse(field.dataset.staffUnit);
      field.querySelector('.staff-person-picker').innerHTML = staffPickerMarkup({
        draft: state.draft,
        unit: { line, model },
        field: field.dataset.staffRole,
        job,
        esc,
        language: state.language,
      });
      field.querySelector('[data-staff-add-hint]').textContent = t(
        job &&
          !field.querySelector('[data-staff-person]') &&
          !field.querySelector('[data-action="staff-manage-people"]')
          ? 'noMorePeople'
          : 'staffAddHint',
      );
    }
    updateStaffSelection(field);
    return;
  }
  if (d.mappingModel !== undefined || d.mappingLineFilter !== undefined) {
    if (d.mappingLineFilter !== undefined) {
      state.mappingLine = el.value;
      state.mappingModel = null;
    } else state.mappingModel = el.value;
    renderSettings();
    $(
      d.mappingLineFilter !== undefined ? '[data-mapping-line-filter]' : '[data-mapping-model]',
    )?.focus();
    return;
  }
  if (d.personJobFilter !== undefined) {
    state.personJob = el.value;
    renderSettings();
    $('#person-job-filter').focus();
    return;
  }
  if (d.targetLine !== undefined) {
    state.targetLine = el.value;
    renderSettings();
    $('#target-line').focus();
    return;
  }
  if (d.batchField !== undefined) {
    state.mappingBatch[Number(d.batchIndex)][d.batchField] = el.value;
    renderSettings();
    $(`[data-batch-field="${d.batchField}"]`)?.focus();
    return;
  }
  if (handleWorkforceChange(state.draft, el)) {
    if (d.personField === 'job') {
      const person = state.draft.personnel[Number(d.personIndex)];
      // Follow an explicit move so a filtered directory cannot make the edited
      // person appear lost. Name/active changes keep their existing DOM focus.
      if (state.personJob !== '') state.personJob = person.job;
      renderSettings();
      $(`[data-person-field="job"][data-person-index="${Number(d.personIndex)}"]`)?.focus();
      toast(t('personJobChanged', { name: person.name, job: person.job }));
    }
    renderSetupProgress();
    updateSettingsSaveState();
    $('#settings-error').hidden = true;
    return;
  }
  if (d.personField === 'job' || d.personField === 'active') {
    renderSettings();
    showSettingsError({ code: 'errPersonnel' });
    return;
  }
  if (d.groupName !== undefined) {
    state.draft.monitoring.groups[Number(d.groupName)].name = el.value;
  } else if (d.groupMember !== undefined) {
    const group = state.draft.monitoring.groups[Number(d.groupMember)];
    group.lines = el.checked
      ? [...new Set([...group.lines, el.value])]
      : group.lines.filter((l) => l !== el.value);
    const count = $('[data-group-count="' + d.groupMember + '"]');
    if (count) count.textContent = t('selectedLineCount', { count: group.lines.length });
  } else if (d.outputSource) {
    state.draft.monitoring.outputSources[d.outputSource] =
      el.value === 'all' || el.value.startsWith('new-') ? el.value : Number(el.value);
  } else if (d.unitOutputSource) {
    state.draft.monitoring.unitOutputSources ||= {};
    state.draft.monitoring.unitOutputSources[d.unitOutputSource] =
      el.value === 'all' || el.value.startsWith('new-') ? el.value : Number(el.value);
  } else if (el.id === 'refresh-seconds') {
    state.draft.monitoring.refreshSeconds = Number(el.value);
  } else if (d.policy) {
    state.draft.monitoring.unified = alertConfig(state.draft.monitoring);
    state.draft.monitoring.unified[d.policy][d.policyField] =
      d.policyField === 'enabled' ? el.checked : Number(el.value);
  } else if (d.alertField) {
    state.draft.monitoring.rules[Number(d.index)][d.alertField] = ['enabled', 'blink'].includes(
      d.alertField,
    )
      ? el.checked
      : d.alertField === 'threshold'
        ? Number(el.value)
        : el.value;
  } else if (d.catalogName) {
    renameCatalog(d.catalogName, Number(d.index), el.value);
    renderSettings();
  } else if (d.rowField || d.rowActive !== undefined || d.rowOutput !== undefined) {
    const index = Number(d.rowOutput ?? d.rowActive ?? d.index);
    const patch = d.rowField
      ? { [d.rowField]: el.value || null }
      : d.rowOutput !== undefined
        ? { hasOutput: el.checked }
        : { active: el.checked };
    const result = updateMapping(state.draft, index, patch);
    renderSettings();
    if (!result.ok) return showSettingsError({ code: result.code });
  } else if (el.id === 'schedule-template-select') {
    state.scheduleTemplateId = el.value;
    state.scheduleLine = '';
    renderSettings();
    return;
  } else if (d.scheduleApplyGroup !== undefined) {
    const group = linePickerGroups(state.draft, state.language).find(
      (group) => group.id === d.scheduleApplyGroup,
    );
    if (group)
      state.scheduleApplyLines = el.checked
        ? [...new Set([...state.scheduleApplyLines, ...group.lines])]
        : state.scheduleApplyLines.filter((line) => !group.lines.includes(line));
    syncSchedulePicker();
    return;
  } else if (d.scheduleApplyLine !== undefined) {
    state.scheduleApplyLines = el.checked
      ? [...new Set([...state.scheduleApplyLines, d.scheduleApplyLine])]
      : state.scheduleApplyLines.filter((line) => line !== d.scheduleApplyLine);
    syncSchedulePicker();
    return;
  } else if (el.id === 'schedule-line-select') {
    state.scheduleLine = el.value;
    renderSettings();
    return;
  } else if (d.schedulePreviewUnit !== undefined) {
    state.schedulePreviewKey = el.value;
    renderSettings();
    return;
  } else if (d.timeField) {
    scheduleDraft(true)[d.shiftKey][Number(d.index)][d.timeField] = el.value;
    renderSettings();
  } else if (d.moveShift) {
    const schedules = scheduleDraft(true);
    const [slot] = schedules[d.moveShift].splice(Number(d.index), 1);
    schedules[el.value].push(slot);
    renderSettings();
  } else if (el.id === 'default-language') state.draft.language = el.value;
  updateSettingsSaveState();
  renderSetupProgress();
  $('#settings-error').hidden = true;
});
$('#settings-body').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id.startsWith('new-')) {
    e.preventDefault();
    $(`[data-action="add-catalog"][data-catalog="${e.target.id.slice(4)}"]`).click();
  }
});
let mappingDrag = null;
function clearMappingDrag() {
  mappingDrag = null;
  $$('.mapping-drop-before, .mapping-drop-after, .mapping-dragging').forEach((row) => {
    row.classList.remove('mapping-drop-before', 'mapping-drop-after', 'mapping-dragging');
  });
}
function finishMappingMove(source, target, after) {
  const result = reorderMapping(state.draft, source, target, after);
  clearMappingDrag();
  if (!result.ok) return showSettingsError({ code: result.code });
  renderSettings();
  const handle = [...$('#settings-body').querySelectorAll('[data-mapping-drag]')].find(
    (button) => button.dataset.mappingDrag === String(source),
  );
  handle?.focus({ preventScroll: true });
  handle?.scrollIntoView({ block: 'nearest' });
  if (result.changed) toast(t('mappingOrderChanged'));
}
$('#settings-body').addEventListener('dragstart', (event) => {
  const handle = event.target.closest('[data-mapping-drag]');
  if (!handle || !canManage() || settingsSaving) return;
  const source = state.draft.rows.find((row) => String(row.id) === handle.dataset.mappingDrag);
  if (!source || !event.dataTransfer) return;
  mappingDrag = { id: source.id, unit: productionKey(source) };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(source.id));
  handle.closest('[data-configured-mapping]').classList.add('mapping-dragging');
});
$('#settings-body').addEventListener('dragover', (event) => {
  const element = event.target.closest('[data-configured-mapping]');
  if (!mappingDrag || !element || settingsSaving) return;
  const target = state.draft.rows.find(
    (row) => String(row.id) === element.dataset.configuredMapping,
  );
  if (!target || target.id === mappingDrag.id || productionKey(target) !== mappingDrag.unit)
    return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  $$('.mapping-drop-before, .mapping-drop-after').forEach((row) =>
    row.classList.remove('mapping-drop-before', 'mapping-drop-after'),
  );
  const bounds = element.getBoundingClientRect();
  element.classList.add(
    event.clientY < bounds.top + bounds.height / 2
      ? 'mapping-drop-before'
      : 'mapping-drop-after',
  );
});
$('#settings-body').addEventListener('drop', (event) => {
  const element = event.target.closest('[data-configured-mapping]');
  if (!mappingDrag || !element || !canManage() || settingsSaving) return clearMappingDrag();
  event.preventDefault();
  const target = state.draft.rows.find(
    (row) => String(row.id) === element.dataset.configuredMapping,
  );
  if (!target || productionKey(target) !== mappingDrag.unit) return clearMappingDrag();
  const bounds = element.getBoundingClientRect();
  finishMappingMove(mappingDrag.id, target.id, event.clientY >= bounds.top + bounds.height / 2);
});
$('#settings-body').addEventListener('dragend', clearMappingDrag);
$('#settings-body').addEventListener('click', async (e) => {
  const issueButton = e.target.closest('[data-issue-action]');
  if (issueButton && state.draft && canManage() && !settingsSaving) {
    state.draft.issuePresets = structuredClone(issuePresets(state.draft));
    const index = Number(issueButton.dataset.issueIndex);
    const action = issueButton.dataset.issueAction;
    if (action === 'add')
      state.draft.issuePresets.push({
        id: draftId(),
        label: '',
        active: true,
      });
    else if (action === 'remove') state.draft.issuePresets.splice(index, 1);
    renderSettings();
    return;
  }
  const workforceButton = e.target.closest('[data-workforce-action]');
  if (workforceButton && state.draft && !settingsSaving && canManage()) {
    const result = handleWorkforceAction(state.draft, workforceButton);
    if (result.handled) {
      renderSettings();
      if (result.focusId) $('#' + result.focusId)?.focus();
    }
    return;
  }
  const b = e.target.closest('[data-action]');
  if (!b || settingsSaving || !canManage()) return;
  const { action, catalog, index, shiftKey, kind, themeName } = b.dataset,
    i = Number(index),
    draft = state.draft;
  if (action === 'save-schedule-settings') return saveSettings();
  if (action === 'add-schedule-template' || action === 'rename-schedule-template') {
    const name = $('#schedule-template-name').value.trim();
    if (
      !name ||
      (draft.scheduleTemplates || []).some(
        (template) =>
          template.id !==
            (action === 'rename-schedule-template' ? state.scheduleTemplateId : '') &&
          template.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      return toast(t('errScheduleTemplates'));
    if (action === 'add-schedule-template') {
      const id = draftId();
      (draft.scheduleTemplates ||= []).push({
        id,
        name,
        schedules: structuredClone(scheduleTemplate(draft, state.scheduleTemplateId).schedules),
      });
      state.scheduleTemplateId = id;
      state.scheduleLine = '';
    } else scheduleTemplate(draft, state.scheduleTemplateId).name = name;
    renderSettings();
    return;
  }
  if (action === 'delete-schedule-template') {
    if (
      state.scheduleTemplateId === 'default' ||
      !(await confirmAction('deleteTemplateTitle', 'deleteTemplateDesc'))
    )
      return;
    draft.scheduleTemplates = draft.scheduleTemplates.filter(
      (template) => template.id !== state.scheduleTemplateId,
    );
    state.scheduleTemplateId = 'default';
    state.scheduleLine = '';
    renderSettings();
    return;
  }
  if (action === 'close-line-picker') {
    $('#schedule-line-picker').open = false;
    $('#schedule-line-picker > summary').focus();
    return;
  }
  if (action === 'schedule-select-all' || action === 'schedule-clear-lines') {
    state.scheduleApplyLines = action === 'schedule-select-all' ? [...draft.lines] : [];
    syncSchedulePicker();
    return;
  }
  if (action === 'apply-schedule-template') {
    const lines = naturalOrder(
      state.scheduleApplyLines.filter((line) => draft.lines.includes(line)),
      state.language,
    );
    if (
      lines.length &&
      (await confirmAction(
        'replaceScheduleTitle',
        'applyTemplateConfirm',
        'confirm',
        'cancel',
        { lines: lines.join(', ') },
      ))
    ) {
      applyScheduleTemplate(draft, state.scheduleTemplateId, lines);
      renderSettings();
      toast(t('templateApplied', { count: lines.length }));
    }
    return;
  }
  if (action === 'copy-schedule-template' || action === 'inherit-schedule') {
    if (!state.scheduleLine) return;
    if (
      Object.hasOwn(state.draft.lineSchedules || {}, state.scheduleLine) &&
      !(await confirmAction('replaceScheduleTitle', 'replaceScheduleDesc'))
    )
      return;
    state.draft.lineSchedules ||= Object.create(null);
    if (action === 'inherit-schedule') delete state.draft.lineSchedules[state.scheduleLine];
    else
      Object.defineProperty(state.draft.lineSchedules, state.scheduleLine, {
        value: structuredClone(scheduleTemplate(draft, state.scheduleTemplateId).schedules),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    renderSettings();
    return;
  }
  if (action === 'add-unit') {
    const line = $('[data-unit-add-line]').value,
      model = $('[data-unit-add-model]').value;
    if (unitFor(draft, { line, model })) return toast(t('combinationExists'));
    if (!setProductionUnit(draft, line, model, true)) return;
    state.unitFilterLine = line;
    state.unitAdd = { line, model: '' };
    renderSettings();
    return;
  }
  if (action === 'remove-unit' || action === 'unit-owner') {
    const [line, model] = JSON.parse(b.dataset.unitKey),
      unit = { line, model };
    if (action === 'unit-owner') {
      state.staffingLine = line;
      state.staffingModel = model;
      openSettingsStep('staffing');
      const owner = $('[data-staff-role="owners"]');
      owner?.scrollIntoView({ block: 'center' });
      owner?.querySelector('select')?.focus();
      return;
    }
    const count = draft.rows.filter(
      (row) => row.active && productionKey(row) === productionKey(unit),
    ).length;
    if (
      !(await confirmAction('retireUnitTitle', 'retireUnitDesc', 'confirm', 'continueEditing', {
        name: productionLabel(unit),
        count,
      }))
    )
      return;
    setProductionUnit(draft, line, model, false);
    renderSettings();
    return;
  }
  if (action === 'staff-manage-people') {
    state.personJob = b.closest('[data-staff-unit]').querySelector('[data-staff-job]').value;
    openSettingsStep('personnel');
    $('[data-workforce-action="add-person"]')?.focus();
    return;
  }
  if (action === 'staff-select-all' || action === 'staff-clear-selection') {
    const field = b.closest('[data-staff-unit]');
    field.querySelectorAll('[data-staff-person]').forEach((input) => {
      input.checked = action === 'staff-select-all';
    });
    updateStaffSelection(field);
    return;
  }
  if (action === 'add-staff-person' || action === 'remove-staff-person') {
    const field = b.closest('[data-staff-unit]'),
      [line, model] = JSON.parse(field.dataset.staffUnit);
    const role = field.dataset.staffRole;
    const adding = action === 'add-staff-person';
    const changed = adding
      ? addStaffAssignments(
          draft,
          { line, model },
          role,
          field.querySelector('[data-staff-job]').value,
          [...field.querySelectorAll('[data-staff-person]:checked')].map(
            (input) => input.value,
          ),
        )
      : changeStaffAssignment(draft, { line, model }, role, b.dataset.personId, false);
    if (changed) {
      const key = JSON.stringify([field.dataset.staffUnit, role]);
      if (adding && state.staffChoices[key]) state.staffChoices[key].people = [];
      renderSettings();
      [...$$('[data-staff-unit]')]
        .find(
          (item) =>
            item.dataset.staffUnit === field.dataset.staffUnit &&
            item.dataset.staffRole === role,
        )
        ?.querySelector('[data-staff-person], [data-staff-job]')
        ?.focus();
    }
    return;
  }
  if (action === 'add-group')
    draft.monitoring.groups.push({
      id: draftId(),
      name: `${t('newGroup')} ${draft.monitoring.groups.length + 1}`,
      lines: [],
    });
  else if (action === 'remove-group') draft.monitoring.groups.splice(i, 1);
  else if (action === 'add-alert')
    draft.monitoring.rules.push({
      id: draftId(),
      type: b.dataset.ruleType,
      threshold: b.dataset.ruleType === 'gap' ? 5 : 300,
      comparison: 'gte',
      color: 'yellow',
      blink: true,
      enabled: true,
    });
  else if (action === 'remove-alert') draft.monitoring.rules.splice(i, 1);
  else if (action === 'add-catalog') {
    const value = $(`#new-${catalog}`).value.trim();
    if (
      !value ||
      draft[catalog].some((v) => v.toLocaleLowerCase() === value.toLocaleLowerCase())
    )
      return toast(t('errDuplicate'));
    draft[catalog].push(value);
  } else if (action === 'remove-catalog') {
    const removed = draft[catalog][i];
    const impact = catalogImpact(draft, catalog, removed);
    if (
      !(await confirmAction(
        'retireCatalogTitle',
        'retireCatalogDesc',
        'confirm',
        'continueEditing',
        { name: removed, ...impact },
      ))
    )
      return;
    removeCatalogItem(draft, catalog, removed);
    if (!draft.lines.includes(state.mappingLine)) state.mappingLine = null;
    if (catalog === 'models' && state.mappingModel === removed) state.mappingModel = '';
  } else if (action === 'add-batch-mappings') {
    const result = addBatchMappings(
      draft,
      [state.mappingLine],
      state.mappingBatch,
      undefined,
      state.mappingModel,
    );
    if (!result.ok) return showSettingsError({ code: result.code });
    state.mappingBatch = [{ job: '', station: '' }];
    renderSettings();
    toast(t('batchMappingsAdded', { count: result.added, skipped: result.skipped }));
    return;
  } else if (action === 'mapping-up' || action === 'mapping-down') {
    const row = draft.rows[i];
    const rows = [...$('#settings-body').querySelectorAll('[data-configured-mapping]')];
    const index = rows.findIndex(
      (element) => element.dataset.configuredMapping === String(row.id),
    );
    const target = rows[index + (action === 'mapping-up' ? -1 : 1)];
    if (target) {
      const mapping = draft.rows.find(
        (item) => String(item.id) === target.dataset.configuredMapping,
      );
      finishMappingMove(row.id, mapping.id, action === 'mapping-down');
    }
    return;
  } else if (action === 'remove-mapping') {
    const result = removeMapping(draft, i);
    if (!result.ok) return showSettingsError({ code: result.code });
    toast(t('mappingDeleted'));
  } else if (action === 'remove-slot') scheduleDraft(true)[shiftKey].splice(i, 1);
  else if (action === 'slot-up' || action === 'slot-down') {
    const items = scheduleDraft(true)[shiftKey],
      j = i + (action === 'slot-up' ? -1 : 1);
    if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]];
  } else if (action === 'add-slot') {
    const items = scheduleDraft(true)[shiftKey],
      start = items.at(-1)?.end || (shiftKey === 'day' ? '08:00' : '20:00'),
      endMinutes = (minutes(start) + (kind === 'break' ? 10 : 60)) % 1440;
    items.push({
      id: draftId(),
      kind,
      start,
      end: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`,
    });
  } else if (action === 'default-theme') draft.theme = themeName;
  else if (action === 'use-defaults') {
    stored('bp-language', null);
    stored('bp-theme', null);
    applyTheme(state.config.theme);
    applyLanguage(state.config.language);
    toast(t('defaultsApplied'));
    return;
  }
  renderSettings();
  $('#settings-error').hidden = true;
});
$$('[data-settings-tab]').forEach(
  (b) =>
    (b.onclick = (event) => {
      if (!followPageLink(event) || b.disabled) return;
      openSettingsStep(b.dataset.settingsTab);
    }),
);
$('.settings-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = $$('[data-settings-tab]').filter((tab) => !tab.disabled),
    index = tabs.indexOf(event.target);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].click();
  tabs[next].focus();
});
async function saveSettings() {
  if (!canManage() || settingsSaving || !state.draft) return;
  settingsSaving = true;
  $('#settings-body').inert = true;
  updateSettingsSaveState();
  renderSetupProgress();
  $('#settings-error').hidden = true;
  try {
    const next = await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify(state.draft),
    });
    state.config = next;
    state.draft = structuredClone(next);
    settingsSnapshot = JSON.stringify(state.draft);
    localDraftSnapshot = '';
    stored(settingsDraftKey(), null);
    if (!stored('bp-theme')) applyTheme(next.theme);
    if (!stored('bp-language')) applyLanguage(next.language);
    populateLineFilters();
    renderSettings();
    await loadRecords();
    toast(t('settingsSaved'));
  } catch (error) {
    showSettingsError(error);
  } finally {
    settingsSaving = false;
    $('#settings-body').inert = false;
    updateSettingsSaveState();
    renderSetupProgress();
  }
}
$$('[data-save-settings]').forEach((button) => {
  button.onclick = saveSettings;
});
$('#reload-settings').onclick = async () => {
  if (!canManage() || settingsSaving || !state.draft) return;
  if (
    settingsDirty() &&
    !(await confirmAction('reloadSettingsTitle', 'reloadSettingsDesc', 'loadSavedSettings'))
  )
    return;
  settingsSaving = true;
  $('#settings-body').inert = true;
  updateSettingsSaveState();
  try {
    // Fetch successfully before discarding a local draft. Older browser drafts
    // must not be able to bring removed jobs/people back into shared settings.
    const latest = await api('/api/config');
    state.config = latest;
    stored(settingsDraftKey(), null);
    beginSettingsDraft();
    renderSettings();
    $('#settings-error').hidden = true;
    populateLineFilters();
    await loadRecords();
  } catch (error) {
    showSettingsError(error);
  } finally {
    settingsSaving = false;
    $('#settings-body').inert = false;
    updateSettingsSaveState();
    renderSetupProgress();
  }
};
$$('[data-save-draft]').forEach((button) => {
  button.onclick = () => {
    if (!state.draft || settingsSaving || !canManage()) return;
    const serialized = JSON.stringify({ draft: state.draft, baseline: settingsSnapshot });
    stored(settingsDraftKey(), serialized);
    // Browser storage can be unavailable or full. Never claim a draft is safe
    // until it can actually be read back; leave navigation protection enabled.
    if (stored(settingsDraftKey()) !== serialized) return toast(t('settingsDraftFailed'));
    localDraftSnapshot = JSON.stringify(state.draft);
    updateSettingsSaveState();
    toast(t('settingsDraftSaved'));
  };
});

$$('[data-view]').forEach(
  (b) =>
    (b.onclick = async (event) => {
      if (!followPageLink(event)) return;
      const secondary = !!b.closest('#nav-more');
      if (b.dataset.view === 'details') {
        state.line = '';
        populateLineFilters();
      }
      const moved = await setView(b.dataset.view, {
        tab: b.dataset.view === 'settings' ? 'structure' : undefined,
      });
      if (moved) {
        $('#nav-more').open = false;
        if (secondary) $('#main').focus({ preventScroll: true });
      }
    }),
);
document.addEventListener('click', (event) => {
  if (!event.target.closest('#nav-more')) $('#nav-more').open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('#nav-more').open && !$('dialog[open]')) {
    $('#nav-more').open = false;
    $('#nav-more > summary').focus();
  }
});
$('#open-settings').onclick = (event) => {
  if (followPageLink(event)) void setView('settings');
};
$$('[data-open-settings]').forEach(
  (b) =>
    (b.onclick = (event) => {
      if (!followPageLink(event) || settingsSaving) return;
      setView('settings', { tab: b.dataset.openSettings });
    }),
);
$('#collapse-sidebar').onclick = () => {
  state.collapsed = !state.collapsed;
  stored('bp-collapsed', String(state.collapsed));
  applyCollapse();
};
$('#language-select').onchange = () => applyLanguage($('#language-select').value, true);
$('#theme-select').onchange = () => applyTheme($('#theme-select').value, true);
$('#records-body').onclick = async (e) => {
  const b = e.target.closest('[data-edit]');
  if (b) {
    const selected = allSlots().find((slot) => slot.id === state.slotId);
    if (reportScope() === 'all' && selected?.shift) state.shift = selected.shift;
    await setView('entry');
    entryController?.openRow?.(Number(b.dataset.edit));
    window.scrollTo({ top: 0 });
  }
};
$('#report-date').onchange = async () => {
  if (!$('#report-date').value) {
    $('#report-date').value = state.date;
    return;
  }
  if (!(await entryController?.canLeave())) {
    $('#report-date').value = state.date;
    return toast(t('resolveEntryChanges'));
  }
  state.date = $('#report-date').value;
  state.page = 1;
  loadRecords();
};
$('#today').onclick = async () => {
  if (!(await entryController?.canLeave())) return toast(t('resolveEntryChanges'));
  state.date = today();
  $('#report-date').value = state.date;
  state.page = 1;
  loadRecords();
};
$$('[data-report-scope]').forEach(
  (b) =>
    (b.onclick = async () => {
      const scope = b.dataset.reportScope;
      if (reportScope() === scope) return;
      if (!(await entryController?.canLeave())) return toast(t('resolveEntryChanges'));
      if (hasWholeDayScope()) state.overviewScope = scope;
      if (scope !== 'all') state.shift = scope;
      state.page = 1;
      state.slotId = '';
      syncReportScopeButtons();
      loadRecords();
    }),
);
function selectDetailLine(value) {
  state.line = value;
  state.page = 1;
  populateLineFilters();
  render();
}
$('#line-select').onchange = () => selectDetailLine($('#line-select').value);
$('#detail-line').onchange = () => selectDetailLine($('#detail-line').value);
$('#detail-group').onchange = () => {
  state.detailGroupId = $('#detail-group').value;
  state.line = '';
  state.page = 1;
  populateLineFilters();
  render();
};
$('#status-select').onchange = () => {
  state.status = $('#status-select').value;
  state.page = 1;
  renderTable();
};
$('#search').oninput = () => {
  state.search = $('#search').value.trim();
  state.page = 1;
  renderTable();
};
$('#previous-page').onclick = () => {
  state.page--;
  renderTable();
};
$('#next-page').onclick = () => {
  state.page++;
  renderTable();
};
$('#slot-tabs').onclick = (e) => {
  const b = e.target.closest('[data-slot]');
  if (b) {
    state.slotId = b.dataset.slot;
    state.page = 1;
    renderSlotTabs();
    renderTable();
  }
};
$('#slot-tabs').onkeydown = (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const slots = allSlots(),
    i = slots.findIndex((s) => s.id === state.slotId),
    n = slots.length,
    next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? n - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
  state.slotId = slots[next].id;
  renderSlotTabs();
  renderTable();
  $('[data-slot][aria-selected="true"]').focus();
};
$('#refresh').onclick = loadRecords;
$('#group-tabs').onclick = (e) => {
  const button = e.target.closest('[data-group]');
  if (button) {
    state.groupId = button.dataset.group;
    state.boardPage = 0;
    state.chartLine = '';
    renderChart();
  }
};
$('#monitor-status-filters').onclick = (event) => {
  const button = event.target.closest('[data-alert-filter]');
  if (!button) return;
  state.alertFilter = button.dataset.alertFilter;
  state.boardPage = 0;
  renderChart();
  $(`[data-alert-filter="${state.alertFilter}"]`)?.focus({ preventScroll: true });
};
$('#line-cards').onclick = (e) => {
  if (handleMonitorAction(e, monitorContext())) return;
  const button = e.target.closest('[data-monitor-line]');
  if (button) {
    if (document.body.classList.contains('fullscreen-board')) {
      showLineDetail($('#line-detail-dialog'), {
        ...monitorContext(),
        line: button.dataset.monitorLine,
        defaults: state.defaults,
      });
      return;
    }
    state.detailGroupId = state.groupId;
    state.line = button.dataset.monitorLine;
    populateLineFilters();
    setView('details');
    window.scrollTo({ top: 0 });
  }
};
$('#chart-line').onchange = () => selectDetailLine($('#chart-line').value);
setInterval(() => {
  if (
    state.user &&
    state.config &&
    ['overview', 'details'].includes(state.view) &&
    !$('#login-dialog').open
  ) {
    renderMonitoring(monitorContext(), { chart: false });
    updateCurrentInterval();
  }
}, 1000);
let refreshTimer, refreshPeriod;
function configureAutoRefresh() {
  const seconds = state.config?.monitoring.refreshSeconds || 10;
  if (refreshPeriod === seconds) return;
  refreshPeriod = seconds;
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (
      state.user &&
      ['overview', 'details'].includes(state.view) &&
      !state.loading &&
      !$('#login-dialog').open &&
      document.visibilityState === 'visible'
    )
      loadRecords(true);
  }, seconds * 1000);
}
$('#refresh-now').onclick = () => loadRecords(true);
$('#export').onclick = async () => {
  const b = $('#export');
  b.disabled = true;
  try {
    const scope = reportScope();
    const suffix = `${state.line ? `&line=${encodeURIComponent(state.line)}` : ''}${state.view === 'details' && state.detailGroupId ? `&group=${encodeURIComponent(state.detailGroupId)}` : ''}`;
    const responses = await Promise.all(
      (scope === 'all' ? ['day', 'night'] : [scope]).map((shift) =>
        fetch(`/api/export?date=${state.date}&shift=${shift}&lang=${state.language}${suffix}`),
      ),
    );
    if (responses.some((response) => response.status === 401)) {
      showLogin(true);
      throw new Error(t('errAuth'));
    }
    if (responses.some((response) => !response.ok)) throw new Error(t('errServer'));
    const csv = await Promise.all(responses.map((response) => response.text()));
    const combined =
      scope === 'all'
        ? [
            csv[0].trimEnd(),
            ...csv.slice(1).map((value) => value.split(/\r?\n/).slice(1).join('\n').trimEnd()),
          ]
            .filter(Boolean)
            .join('\n') + '\n'
        : csv[0];
    const url = URL.createObjectURL(new Blob([combined], { type: 'text/csv;charset=utf-8' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `BP9-${state.date}-${scope}-${state.language}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('exported'));
  } catch (error) {
    toast(error.message);
  } finally {
    b.disabled = false;
  }
};
document.addEventListener('keydown', (e) => {
  if (
    e.key === '/' &&
    state.view === 'details' &&
    !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) &&
    !$$('dialog[open]').length &&
    state.view !== 'settings'
  ) {
    e.preventDefault();
    $('#search').focus();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (settingsNeedProtection() || entryController?.hasPendingChanges()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('click', (e) => {
  for (const picker of $$('.group-line-picker[open]'))
    if (!picker.contains(e.target)) picker.open = false;
});
function updateCurrentInterval() {
  if (!state.config) return;
  const scope = reportScope();
  const unit =
    state.view === 'details' &&
    detailUnits().find((unit) => productionKey(unit) === state.line);
  const lineConfig = unit
    ? { ...state.config, schedules: schedulesForLine(state.config, unit.line) }
    : state.config;
  if (!unit && Object.keys(state.config.lineSchedules || {}).length) {
    $('#current-interval').textContent = t('perLineSchedule');
    return;
  }
  const currentShift =
    scope === 'all'
      ? ['day', 'night'].find((shift) =>
          currentScheduleInterval(
            lineConfig,
            state.date,
            shift,
            Date.now() + state.serverOffset,
          ),
        ) || state.shift
      : scope;
  const slot = currentScheduleInterval(
      lineConfig,
      state.date,
      currentShift,
      Date.now() + state.serverOffset,
    ),
    text = slot
      ? label(slot) + (slot.kind === 'break' ? ' / ' + t('break') : '')
      : t(
          monitoringPeriodState(
            lineConfig,
            state.date,
            currentShift,
            Date.now() + state.serverOffset,
          ),
        );
  const el = $('#current-interval');
  if (el) el.textContent = t('currentInterval') + ': ' + text;
}
function applyBoardDisplay() {
  const board = document.body.classList.contains('fullscreen-board'),
    trend = stored('bp-board-trend') === 'true',
    share = stored('bp-board-share') === 'true';
  $('#board-show-trend').checked = trend;
  $('#board-show-share').checked = share;
  $('.group-trend-panel').hidden = board && !trend;
  $('.share-panel').hidden = board && !share;
  $('.dashboard-top-charts').hidden = board && !trend && !share;
  $('.dashboard-top-charts').classList.toggle('single-chart', board && trend !== share);
  $('.dashboard-top-charts').dataset.chartMode =
    trend && share ? 'both' : trend ? 'trend' : share ? 'share' : 'none';
  document.body.classList.toggle('board-with-charts', board && (trend || share));
}
for (const button of document.querySelectorAll('[data-metric-scope]')) {
  button.onclick = () => {
    stored('bp-metric-scope', button.dataset.metricScope);
    renderChart();
  };
}
$('#board-show-trend').onchange = (e) => {
  stored('bp-board-trend', String(e.target.checked));
  renderChart();
};
$('#board-show-share').onchange = (e) => {
  stored('bp-board-share', String(e.target.checked));
  renderChart();
};
let chartWidth = 0;
const chartObserver = new ResizeObserver((entries) => {
  const width = Math.round(entries[0].contentRect.width);
  if (width > 0 && width !== chartWidth) {
    chartWidth = width;
    if (state.config && state.view === 'details') renderChart();
  }
});
chartObserver.observe($('#chart'));
// Re-measure plots when sidebar, display options or fullscreen change their
// containers. Geometry keys prevent the SVG redraw from triggering a loop.
const trendGeometry = new WeakMap();
const trendObserver = new ResizeObserver((entries) => {
  let changed = false;
  for (const { target, contentRect } of entries) {
    const key = `${Math.round(contentRect.width)}:${Math.round(contentRect.height)}`;
    if (contentRect.width > 0 && trendGeometry.get(target) !== key) {
      trendGeometry.set(target, key);
      changed = true;
    }
  }
  if (changed && state.config && ['overview', 'details'].includes(state.view)) renderChart();
});
trendObserver.observe($('#group-trend'));
trendObserver.observe($('#line-cards'));
window.addEventListener('resize', () => {
  if (
    state.config &&
    (state.view === 'details' || document.body.classList.contains('fullscreen-board'))
  )
    renderChart();
});
$('#board-pagination').onclick = (e) => {
  const button = e.target.closest('[data-board-page]');
  if (button) {
    state.boardPage = Number(button.dataset.boardPage);
    renderChart();
  }
};

async function leaveFullscreen() {
  document.body.classList.remove('fullscreen-board');
  hideTrendTooltip();
  if (state.config) renderChart();
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {}
  }
}
$('#enter-fullscreen').onclick = () => {
  document.body.classList.add('fullscreen-board');
  state.boardPage = 0;
  renderChart();
  window.scrollTo({ top: 0 });
  try {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } catch {}
};
$('#exit-fullscreen').onclick = leaveFullscreen;
$('#back-overview').onclick = () => setView('overview');
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    document.body.classList.remove('fullscreen-board');
    if (state.config) renderChart();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideTrendTooltip();
    if (document.body.classList.contains('fullscreen-board') && !$('#line-detail-dialog').open)
      leaveFullscreen();
  }
});
function hideTrendTooltip() {
  $('#trend-tooltip').hidden = true;
}
function positionTrendTooltip(x, y) {
  const tip = $('#trend-tooltip');
  tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - tip.offsetWidth - 8)) + 'px';
  tip.style.top = Math.max(8, Math.min(y + 14, innerHeight - tip.offsetHeight - 8)) + 'px';
}
document.addEventListener('pointerover', (e) => {
  const point = e.target.closest('[data-trend-tip]');
  if (!point) return;
  const tip = $('#trend-tooltip');
  tip.textContent = point.dataset.trendTip;
  tip.hidden = false;
  positionTrendTooltip(e.clientX, e.clientY);
});
document.addEventListener('pointermove', (e) => {
  if (!$('#trend-tooltip').hidden) positionTrendTooltip(e.clientX, e.clientY);
});
document.addEventListener('pointerout', (e) => {
  if (e.target.closest('[data-trend-tip]') && !e.relatedTarget?.closest?.('[data-trend-tip]'))
    hideTrendTooltip();
});
document.addEventListener('focusin', (e) => {
  const point = e.target.closest('[data-trend-tip]');
  if (!point) return;
  const rect = point.getBoundingClientRect();
  $('#trend-tooltip').textContent = point.dataset.trendTip;
  $('#trend-tooltip').hidden = false;
  positionTrendTooltip(rect.x, rect.y);
});
document.addEventListener('focusout', hideTrendTooltip);
window.addEventListener('scroll', hideTrendTooltip, true);

entryController = createEntryController({
  mount: $('#entry-content'),
  api,
  getContext: () => ({
    config: state.config,
    records: state.records,
    defaults: state.defaults,
    rowVersions: state.rowVersions,
    date: state.date,
    shift: state.shift,
    loading: state.loading,
    language: state.language,
    canManage: canManage(),
  }),
  onSaved: (saved, meta) => {
    if (meta?.key && !meta.key.startsWith(state.date + '|' + state.shift + '|')) return;
    state.records.set(saved.rowId, saved);
    state.rowVersions[saved.rowId] = saved.version;
    if (saved.activity) state.activity[saved.rowId] = saved.activity;
    state.lastTime = Date.now();
    updateConnection();
  },
  onImported: () => loadRecords(true),
  onNavigate: async ({ date, shift }) => {
    if (state.date === date && state.shift === shift) return;
    state.date = date;
    state.shift = shift;
    $('#report-date').value = date;
    syncReportScopeButtons();
    await loadRecords();
  },
  onConfirm: ({ title, description, confirm, cancel }) =>
    confirmText(title, description, confirm, cancel),
  onConfigure: async (unit) => {
    if (!canManage()) return;
    await setView('settings');
    if (state.view !== 'settings') return;
    state.mappingLine = unit.line;
    state.mappingModel = unit.model;
    openSettingsStep('workforce');
    $('#settings-body').scrollIntoView({ block: 'start' });
  },
  t,
  number,
  language: () => state.language,
});
applyTheme(state.theme);
applyLanguage(state.language);
$('#login-dialog').addEventListener('cancel', (e) => e.preventDefault());
$('#login-language').onchange = () => applyLanguage($('#login-language').value, true);
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = $('#login-submit');
  if (button.disabled) return;
  $('#login-error').hidden = true;
  button.disabled = true;
  button.textContent = t('loggingIn');
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      allowAnonymous: true,
      body: JSON.stringify({
        username: $('#login-username').value.trim(),
        password: $('#login-password').value,
      }),
    });
    $('#login-password').value = '';
    await initializeWorkspace(user);
    $('#login-dialog').close();
  } catch (error) {
    showError('#login-error', error);
  } finally {
    button.disabled = false;
    button.textContent = t('loginSubmit');
  }
});
$('#logout').onclick = async () => {
  if (settingsSaving) return;
  if (!(await entryController?.canLeave())) return toast(t('resolveEntryChanges'));
  const dirty = settingsNeedProtection() || entryController?.hasPendingChanges();
  if (dirty && !(await confirmAction('logoutTitle', 'logoutDesc', 'logout', 'continueEditing')))
    return;
  try {
    await api('/api/auth/logout', {
      method: 'POST',
      body: '{}',
      allowAnonymous: true,
    });
    entryController?.reset?.();
    state.draft = null;
    state.config = null;
    state.records.clear();
    state.rowVersions = {};
    state.view = 'overview';
    $('#settings-body').innerHTML = '';
    $('#records-body').innerHTML = '';
    // Let the reloaded page open login after it finishes initialization. Opening
    // a form here lets quick typing land in a document that is about to vanish.
    location.reload();
  } catch (error) {
    toast(error.message);
  }
};
try {
  const { user } = await api('/api/auth/me', { allowAnonymous: true });
  await initializeWorkspace(user);
} catch (error) {
  if (error.code === 'errAuth') showLogin();
  else {
    showLogin();
    showError('#login-error', error);
  }
}
