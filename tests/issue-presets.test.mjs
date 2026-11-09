import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultIssuePresets,
  issueLabel,
  issuePresets,
  validateIssuePresets,
} from '../public/issue-presets.js';

test('issue quick text is a validated English list and migrates legacy labels', () => {
  assert.equal(validateIssuePresets(defaultIssuePresets), true);
  const items = structuredClone(defaultIssuePresets);
  items[0].label = '';
  assert.equal(validateIssuePresets(items), false);
  items[0].label = 'Equipment downtime';
  items.push({ ...items[0], id: 'duplicate-label' });
  assert.equal(validateIssuePresets(items), false);
  assert.equal(issueLabel(defaultIssuePresets[0]), 'Equipment downtime');
  assert.deepEqual(
    issuePresets({
      issuePresets: [
        {
          id: 'legacy',
          labels: { en: 'Legacy English', zh: '舊文字', th: 'ข้อความเดิม' },
          active: true,
          confirmed: true,
        },
      ],
    }),
    [{ id: 'legacy', label: 'Legacy English', active: true }],
  );
});
