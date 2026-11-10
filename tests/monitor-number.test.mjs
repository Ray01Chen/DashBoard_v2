import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monitorNumber } from '../public/monitor-ui.js';
import { locales, localeTags } from '../public/i18n.js';
test('compact monitor values preserve null/zero and format extreme numbers in each locale', () => {
  for (const language of locales) {
    const ctx = {
      language,
      number: (value) =>
        value == null ? '—' : new Intl.NumberFormat(localeTags[language]).format(value),
    };
    assert.equal(monitorNumber(null, ctx), '—');
    assert.equal(monitorNumber(0, ctx), '0');
    assert.equal(monitorNumber(200, ctx), '200');
    for (const value of [99999999, -99999999, 9999999900]) {
      assert.ok(monitorNumber(value, ctx).length <= 7);
      assert.notEqual(monitorNumber(value, ctx), ctx.number(value));
    }
  }
});
