import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMonitorPageTurn, pageMotionDuration } from '../public/monitor-carousel.js';
import { defaultMonitoring, defaultPageRotateSeconds } from '../public/monitor.js';

test('carousel animates only navigation within the same scope, mode and capacity', () => {
  const before = {
    revision: 0,
    page: 0,
    signature: 'same lines/date/floor/shift/filter',
    size: 7,
    board: true,
    metric: 'interval',
    language: 'zh',
  };
  const after = { ...before, revision: 1, page: 1 };
  assert.equal(isMonitorPageTurn(undefined, after), false);
  assert.equal(isMonitorPageTurn(before, after), true);
  assert.equal(isMonitorPageTurn(before, { ...before }), false);
  for (const change of [
    { signature: 'new filter' },
    { size: 5 },
    { board: false },
    { metric: 'day' },
    { language: 'en' },
  ])
    assert.equal(isMonitorPageTurn(before, { ...after, ...change }), false);
  assert.equal(pageMotionDuration, 600);
});
test('new monitoring configurations share the twelve-second default', () => {
  assert.equal(defaultPageRotateSeconds, 12);
  assert.equal(defaultMonitoring({ lines: [], rows: [] }).pageRotateSeconds, 12);
});
