import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MonitorPaging } from '../public/monitor-paging.js';
import { boardPage } from '../public/monitor.js';
const keys = Array.from({ length: 15 }, (_, i) => 'CD' + (i + 1));
test('all pages contain at most seven items, preserving order and every line', () => {
  for (const count of [0, 1, 6, 7, 8, 14, 15, 30]) {
    const input = keys.concat(keys).slice(0, count),
      output = [];
    for (let page = 0; page < Math.max(1, Math.ceil(count / 7)); page++) {
      const result = boardPage(input, page, 7);
      assert.ok(result.lines.length <= 7);
      output.push(...result.lines);
    }
    assert.deepEqual(output, input);
  }
});
test('automatic rotation wraps at the configured interval without depending on polls', () => {
  const state = new MonitorPaging();
  state.update(keys, 'scope', 10, 0);
  assert.equal(state.tick(9999), false);
  assert.equal(state.tick(10000), true);
  assert.equal(state.page, 1);
  state.update(keys, 'scope', 10, 15000);
  assert.equal(state.tick(20000), true);
  assert.equal(state.page, 2);
  assert.equal(state.tick(30000), true);
  assert.equal(state.page, 0);
});
test('manual actions receive a complete dwell and survive same-list refreshes', () => {
  const state = new MonitorPaging();
  state.update(keys, 'scope', 20, 0);
  state.select(1, 19999);
  state.update(keys, 'scope', 20, 20000);
  assert.equal(state.tick(20000), false);
  assert.equal(state.page, 1);
  assert.equal(state.tick(39998), false);
  assert.equal(state.tick(39999), true);
  assert.equal(state.page, 2);
});
test('filter or membership changes reset pagination; mode changes do not reorder data', () => {
  const state = new MonitorPaging();
  state.update(keys, 'day/floor1', 10, 0);
  state.select(2, 100);
  state.update(keys, 'night/floor1', 10, 200);
  assert.equal(state.page, 0);
  state.select(2, 300);
  state.update(keys.slice(0, 8), 'night/floor1', 10, 400);
  assert.equal(state.page, 0);
  assert.equal(state.pages, 2);
});
test('disabled, single-page and paused carousels do not advance', () => {
  const state = new MonitorPaging();
  state.update(keys, 'scope', 0, 0);
  assert.equal(state.tick(999999), false);
  state.update(keys, 'scope', 10, 0);
  assert.equal(state.tick(15000, true), false);
  assert.equal(state.tick(24999), false);
  assert.equal(state.tick(25000), true);
  state.update(keys.slice(0, 7), 'scope', 1, 0);
  assert.equal(state.tick(9000), false);
});
