import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupSettings, alertSettings } from '../public/dashboard.js';
import { translate } from '../public/i18n.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
const context = (draft, language = 'en') => ({
  draft,
  esc,
  t: (key, params) => translate(language, key, params),
  icon: (name) => `<svg data-test-icon="${name}"></svg>`,
});

test('group settings render groups without duplicating per-unit station source controls', () => {
  const draft = {
    lines: ['A', 'B'],
    rows: [
      { id: 1, line: 'A', station: 'Pack', active: true },
      { id: 2, line: 'A', station: 'Retired', active: false },
      { id: 3, line: 'B', station: 'Check', active: true },
    ],
    monitoring: {
      groups: [{ id: 'g1', name: 'Group <A> & B', lines: ['A'] }],
      outputSources: { A: 1, B: 'all' },
      get rules() {
        throw new Error('The group page must not render alert rules.');
      },
    },
  };
  const html = groupSettings(context(draft));
  assert.match(html, /Group &lt;A&gt; &amp; B/);
  assert.match(html, /data-group-member="0" value="A" checked/);
  assert.equal([...html.matchAll(/data-unit-output-source=/g)].length, 0);
  assert.doesNotMatch(html, /Retired/);
  assert.doesNotMatch(html, /data-alert-field|refresh-seconds|data-action="add-alert"/);
});

test('alert settings keep legacy indexes and expose per-unit capacity without group catalogs', () => {
  const rule = (id, type, enabled = true) => ({
    id,
    type,
    enabled,
    threshold: 10,
    comparison: 'gte',
    color: 'red',
    blink: false,
  });
  const draft = {
    monitoring: {
      refreshSeconds: 25,
      rules: [rule('idle-1', 'idle'), rule('gap-1', 'gap', false), rule('idle-2', 'idle')],
      get groups() {
        throw new Error('The alert page must not render groups.');
      },
    },
    lines: ['A'],
    productionUnits: [{ line: 'A', model: 'Default', dailyTarget: 100 }],
  };
  const html = alertSettings(context(draft));
  assert.match(html, /id="refresh-seconds"[^>]*value="25"/);
  assert.match(html, /data-alert-field="enabled" data-index="1"\s+aria-label/);
  assert.match(html, /data-alert-field="enabled" data-index="2" checked/);
  assert.equal([...html.matchAll(/data-action="add-alert"/g)].length, 2);
  assert.match(html, /data-rule-type="gap"/);
  assert.match(html, /data-rule-type="idle"/);
  assert.doesNotMatch(html, /data-group-name|data-group-member|data-output-source/);
});

test('empty group and alert pages retain their independent add controls in all supported languages', () => {
  const draft = {
    lines: [],
    rows: [],
    monitoring: { groups: [], outputSources: {}, rules: [], refreshSeconds: 10 },
  };
  for (const language of ['en', 'zh', 'th']) {
    const groups = groupSettings(context(draft, language));
    const alerts = alertSettings(context(draft, language));
    assert.match(groups, /data-action="add-group"/);
    assert.match(alerts, /data-action="add-alert"/);
    assert.match(groups, new RegExp(translate(language, 'groupsTitle')));
    assert.match(alerts, new RegExp(translate(language, 'gapAlert')));
    assert.doesNotMatch(groups + alerts, /undefined|NaN/);
  }
});
