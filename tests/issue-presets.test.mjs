import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultIssuePresets, suggestIssueTranslations, validateIssuePresets, issueLabel } from '../public/issue-presets.js';

test('issue quick text requires complete reviewed translations and suggests known reasons', () => {
  assert.equal(validateIssuePresets(defaultIssuePresets), true);
  const items = structuredClone(defaultIssuePresets);
  items[0].confirmed = false;
  assert.equal(validateIssuePresets(items), false);
  items[0].confirmed = true;
  items[0].labels.th = '';
  assert.equal(validateIssuePresets(items), false);
  for (const label of Object.values(defaultIssuePresets[0].labels)) {
    assert.deepEqual(suggestIssueTranslations(label), defaultIssuePresets[0].labels);
  }
  assert.equal(suggestIssueTranslations('A custom reason requiring review'), undefined);
  assert.equal(issueLabel(defaultIssuePresets[0], 'zh'), '設備停機');
});
