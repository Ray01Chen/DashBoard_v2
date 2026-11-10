import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardDisplayDefaults, boardDisplayPreferences } from '../public/board-display.js';

test('fullscreen display defaults show interface sections and leave optional charts off', () => {
  assert.deepEqual(boardDisplayPreferences(), {
    header: true,
    filters: true,
    group: true,
    alerts: true,
    carousel: true,
    trend: false,
    share: false,
  });
});
test('saved false is preserved; legacy chart choices migrate without overriding new choices', () => {
  assert.equal(
    boardDisplayPreferences({ group: false, trend: false }, { trend: true, share: true }).group,
    false,
  );
  assert.equal(boardDisplayPreferences({ trend: false }, { trend: true }).trend, false);
  assert.equal(boardDisplayPreferences(null, { share: true }).share, true);
});
test('invalid values and unknown keys cannot hide controls or become DOM preferences', () => {
  const value = boardDisplayPreferences({
    header: 'false',
    filters: 0,
    alerts: null,
    unknown: false,
  });
  assert.deepEqual(value, boardDisplayDefaults);
  assert.equal(Object.hasOwn(value, 'unknown'), false);
});
test('restoring defaults returns an independent copy', () => {
  const preferences = boardDisplayPreferences();
  preferences.header = false;
  assert.equal(boardDisplayPreferences().header, true);
});
