import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleWorkforceAction,
  handleWorkforceChange,
  changeStaffAssignment,
  addStaffAssignments,
  staffPickerMarkup,
  mappingStaff,
  staffCandidates,
  lineModelsMarkup,
  setupReadiness,
  staffSettingsMarkup,
  workforceMessages,
  workforceSettingsMarkup,
  lineStaffingMarkup,
  targetsSettingsMarkup,
} from '../public/workforce-settings.js';
import { removeCatalogItem } from '../public/catalog-settings.js';
import { helpMarkup } from '../public/help.js';

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
const icon = () => '';

function draftFixture() {
  return {
    jobs: ['Pack', 'Test'],
    lines: ['Line <1>'],
    stations: ['Packing', 'Testing'],
    schedules: {
      day: [{ id: 'day', kind: 'production', start: '08:00', end: '09:00' }],
      night: [{ id: 'night', kind: 'production', start: '20:00', end: '21:00' }],
    },
    personnel: [
      { id: 'person-a', name: 'Alex <Lead>', job: 'Pack', active: true },
      { id: 'person-b', name: 'Former colleague', job: 'Test', active: false },
    ],
    lineStaffing: { 'Line <1>': { day: ['person-a'], night: ['person-b'], owners: ['person-a'] } },
    rows: [
      { id: 1, line: 'Line <1>', station: 'Packing', job: 'Pack', active: true, dailyTarget: 0 },
      { id: 2, line: 'Line <1>', station: 'Testing', job: 'Test', active: true, dailyTarget: null },
      {
        id: 3,
        line: 'Line <1>',
        station: 'Old station',
        job: 'Pack',
        active: false,
        dailyTarget: 10,
      },
    ],
  };
}

test('personnel additions have stable IDs and removal clears only draft assignments', () => {
  const draft = draftFixture();
  const savedSnapshot = structuredClone(draft);
  const added = handleWorkforceAction(draft, {
    dataset: { workforceAction: 'add-person', personJob: 'Test' },
  });
  const person = draft.personnel.at(-1);
  assert.equal(added.handled, true);
  assert.equal(added.rerender, true);
  assert.match(person.id, /^person-[\da-f-]{36}$/i);
  assert.equal(person.job, 'Test');
  assert.equal(person.active, true);
  assert.equal(added.focusId, 'person-name-2');

  handleWorkforceAction(draft, { dataset: { workforceAction: 'remove-person', personIndex: '0' } });
  assert.deepEqual(draft.lineStaffing['Line <1>'], { day: [], night: ['person-b'], owners: [] });
  assert.equal(savedSnapshot.personnel[0].name, 'Alex <Lead>');
  assert.deepEqual(savedSnapshot.lineStaffing['Line <1>'].day, ['person-a']);
});

test('explicit staff additions reject duplicates, inactive people and unknown references', () => {
  const draft = draftFixture(),
    unit = { line: 'Line <1>', model: 'Default' };
  assert.equal(changeStaffAssignment(draft, unit, 'day', 'person-a'), false);
  assert.equal(changeStaffAssignment(draft, unit, 'day', 'person-b'), false);
  assert.equal(changeStaffAssignment(draft, unit, 'day', 'missing'), false);
  assert.equal(changeStaffAssignment(draft, { line: 'missing' }, 'day', 'person-a'), false);
  assert.equal(changeStaffAssignment(draft, unit, '__proto__', 'person-a'), false);
  assert.equal(changeStaffAssignment(draft, unit, 'day', 'person-a', false), true);
  assert.deepEqual(draft.lineStaffing['Line <1>'].day, []);
  assert.equal(changeStaffAssignment(draft, unit, 'day', 'person-a'), true);
  assert.deepEqual(draft.lineStaffing['Line <1>'].owners, ['person-a']);
});

test('batch assignment adds several colleagues in one job independently per role and model', () => {
  const draft = draftFixture();
  draft.personnel.push(
    { id: 'person-c', name: 'Second packer', job: 'Pack', active: true },
    { id: 'person-d', name: 'Third packer', job: 'Pack', active: true },
  );
  draft.models = ['One', 'Two'];
  draft.productionUnits = draft.models.map((model) => ({
    line: 'Line <1>',
    model,
    dailyTarget: 100,
    staffing: { day: ['person-a'], night: [], owners: ['person-a'] },
  }));
  const before = structuredClone(draft);
  const unit = { line: 'Line <1>', model: 'One' };
  assert.equal(
    addStaffAssignments(draft, unit, 'day', 'Pack', ['person-c', 'person-d', 'person-c']),
    true,
  );
  assert.deepEqual(draft.productionUnits[0].staffing.day, ['person-a', 'person-c', 'person-d']);
  assert.deepEqual(draft.productionUnits[1], before.productionUnits[1]);
  assert.deepEqual(draft.productionUnits[0].staffing.owners, ['person-a']);
  assert.equal(addStaffAssignments(draft, unit, 'night', 'Pack', ['person-c', 'person-d']), true);
  for (const role of ['day', 'night']) {
    assert.deepEqual(
      mappingStaff(draft, { ...unit, job: 'Pack' })[role].map((person) => person.id),
      role === 'day' ? ['person-a', 'person-c', 'person-d'] : ['person-c', 'person-d'],
    );
    assert.deepEqual(mappingStaff(draft, { ...unit, job: 'Test' })[role], []);
  }
  assert.equal(draft.productionUnits[0].dailyTarget, 100);
  assert.deepEqual(draft.personnel, before.personnel);
});

test('invalid batch selections are rejected atomically without losing existing assignments', () => {
  const draft = draftFixture(),
    unit = { line: 'Line <1>' };
  draft.personnel.push({ id: 'person-c', name: 'Second packer', job: 'Pack', active: true });
  const before = structuredClone(draft);
  for (const ids of [
    [],
    null,
    ['person-c', 'missing'],
    ['person-c', 'person-b'],
    ['person-c', 'person-a'],
  ]) {
    assert.equal(addStaffAssignments(draft, unit, 'day', 'Pack', ids), false);
    assert.deepEqual(draft, before);
  }
  for (const [where, role, job] of [
    [unit, 'day', 'Test'],
    [unit, '__proto__', 'Pack'],
    [{ line: 'missing' }, 'day', 'Pack'],
  ]) {
    assert.equal(addStaffAssignments(draft, where, role, job, ['person-c']), false);
    assert.deepEqual(draft, before);
  }
  assert.equal(addStaffAssignments(draft, unit, 'night', 'Pack', ['person-a', 'person-c']), true);
  assert.deepEqual(draft.lineStaffing['Line <1>'].night, ['person-b', 'person-a', 'person-c']);
});

test('checkbox picker retains valid multi-selections, escapes names and never mutates settings', () => {
  const draft = draftFixture(),
    unit = { line: 'Line <1>' };
  draft.personnel.push({ id: 'person-c', name: 'Second <packer>', job: 'Pack', active: true });
  const before = structuredClone(draft);
  const choices = {
    [JSON.stringify([JSON.stringify(['Line <1>', 'Default']), 'night'])]: {
      job: 'Pack',
      people: ['person-a', 'person-c', 'missing', 'person-b'],
    },
  };
  const html = lineStaffingMarkup({ draft, esc, icon, language: 'en', choices });
  assert.equal((html.match(/data-staff-person value=/g) || []).length, 2);
  assert.equal((html.match(/ checked>/g) || []).length, 2);
  assert.ok(html.includes('Add selected (2)'));
  assert.ok(html.includes('Second &lt;packer&gt;'));
  assert.ok(!html.includes('data-staff-person-select'));
  for (const language of ['en', 'zh', 'th']) {
    const picker = staffPickerMarkup({
      draft,
      unit,
      field: 'night',
      job: 'Pack',
      personIds: ['person-a'],
      esc,
      language,
    });
    assert.equal((picker.match(/type="checkbox"/g) || []).length, 2);
    assert.ok(picker.includes('aria-live="polite"'));
    assert.ok(picker.includes('data-action="staff-select-all"'));
  }
  assert.deepEqual(draft, before);
});

test('daily-target controls distinguish zero, unknown and invalid fractional input', () => {
  const draft = draftFixture();
  for (const [input, expected] of [
    ['0', 0],
    ['', null],
    ['1000', 1000],
    ['1.5', 1.5],
  ]) {
    assert.equal(
      handleWorkforceChange(draft, { dataset: { lineTarget: 'Line <1>' }, value: input }),
      true,
    );
    assert.equal(draft.lineTargets['Line <1>'], expected);
  }
  assert.equal(handleWorkforceChange(draft, { dataset: { lineTarget: '99' }, value: '10' }), false);
  assert.equal(handleWorkforceChange(draft, { dataset: { lineTarget: '' }, value: '10' }), false);
  assert.equal(
    handleWorkforceChange(draft, { dataset: { lineTarget: '0.5' }, value: '10' }),
    false,
  );
});

test('job-filtered candidates exclude inactive and assigned people without changing saved choices', () => {
  const draft = draftFixture(),
    unit = { line: 'Line <1>' };
  draft.personnel.push({ id: 'person-c', name: 'Second packer', job: 'Pack', active: true });
  const before = structuredClone(draft);
  assert.deepEqual(
    staffCandidates(draft, unit, 'day', 'Pack').map((person) => person.id),
    ['person-c'],
  );
  assert.deepEqual(staffCandidates(draft, unit, 'day', 'Test'), []);
  assert.deepEqual(staffCandidates(draft, unit, 'day', 'Missing'), []);
  assert.deepEqual(staffCandidates(draft, unit, '__proto__', 'Pack'), []);
  assert.deepEqual(draft, before);
  assert.equal(changeStaffAssignment(draft, unit, 'night', 'person-b', false), true);
  assert.deepEqual(draft.lineStaffing['Line <1>'].day, ['person-a']);
});

test('assignment jobs follow the entire master list, including newly added jobs without people', () => {
  const draft = draftFixture();
  draft.jobs.push('New owner');
  const choiceKey = JSON.stringify([JSON.stringify(['Line <1>', 'Default']), 'day']);
  const options = {
    draft,
    esc,
    icon,
    language: 'en',
    choices: { [choiceKey]: { job: 'New owner', people: [] } },
  };
  const before = structuredClone(draft);
  const html = lineStaffingMarkup(options);
  assert.equal((html.match(/value="New owner"/g) || []).length, 3);
  assert.ok(html.includes('No people in this job yet'));
  assert.ok(html.includes('data-action="staff-manage-people"'));
  assert.deepEqual(draft, before);
  draft.personnel.push(
    { id: 'new-a', name: 'New owner A', job: 'New owner', active: true },
    { id: 'new-b', name: 'New owner B', job: 'New owner', active: true },
  );
  const updated = lineStaffingMarkup(options);
  assert.equal((updated.match(/data-staff-person value=/g) || []).length, 2);
  assert.ok(!updated.includes('data-action="staff-manage-people"'));
});

test('empty candidate messages distinguish inactive people from an already complete team', () => {
  const draft = draftFixture(),
    unit = { line: 'Line <1>' };
  const picker = (job) =>
    staffPickerMarkup({ draft, unit, field: 'day', job, esc, language: 'en' });
  assert.ok(picker('Test').includes('People in this job are inactive'));
  assert.ok(picker('Test').includes('data-action="staff-manage-people"'));
  assert.ok(picker('Pack').includes('already assigned here'));
  assert.ok(!picker('Pack').includes('data-action="staff-manage-people"'));
  assert.ok(picker('').includes('Choose a job to see available people'));
});

test('personnel state changes retain inactive assignments for review', () => {
  const draft = draftFixture();
  handleWorkforceChange(draft, {
    dataset: { personField: 'active', personIndex: '0' },
    checked: false,
  });
  assert.equal(draft.personnel[0].active, false);
  assert.deepEqual(draft.lineStaffing['Line <1>'].day, ['person-a']);
  handleWorkforceChange(draft, {
    dataset: { personField: 'name', personIndex: '0' },
    value: '  Updated  ',
  });
  assert.equal(draft.personnel[0].name, 'Updated');
});

test('settings escape names and render one target per line without exposing unselected inactive people', () => {
  const draft = draftFixture();
  const people = workforceSettingsMarkup({ draft, esc, icon, language: 'en' });
  assert.ok(people.includes('Alex &lt;Lead&gt;'));
  assert.ok(!people.includes('Alex <Lead>'));
  const staffing = staffSettingsMarkup({
    draft,
    esc,
    icon,
    language: 'en',
    selectedLines: draft.lines,
  });
  assert.ok(staffing.includes('Line &lt;1&gt;'));
  assert.ok(
    !staffing.includes('data-row-field="line"'),
    'line comes from the master-list selection',
  );
  const targets = targetsSettingsMarkup({ draft, esc, icon, language: 'en' });
  assert.equal((targets.match(/data-line-target=/g) || []).length, 1);
  assert.ok(targets.includes('value="0"'));
  assert.ok(!targets.includes('Old station'));
  assert.equal(
    (
      lineStaffingMarkup({ draft, esc, icon, language: 'en' }).match(
        /data-person-id="person-b"/g,
      ) || []
    ).length,
    1,
    'inactive person is visible only in the team that already selected them',
  );
});

test('line target filters preserve hidden edits without depending on mappings', () => {
  const draft = draftFixture();
  draft.lines.push('Line <2>');
  draft.rows = [];
  draft.lineTargets = { 'Line <1>': 0, 'Line <2>': 200 };
  const before = structuredClone(draft);
  const markup = (selectedLine) =>
    targetsSettingsMarkup({ draft, esc, language: 'en', selectedLine });
  assert.equal((markup().match(/data-line-target=/g) || []).length, 1);
  assert.ok(markup('Line <2>').includes('data-line-target="Line &lt;2&gt;"'));
  assert.deepEqual(draft, before);
  handleWorkforceChange(draft, { dataset: { lineTarget: 'Line <2>' }, value: '456' });
  assert.equal(draft.lineTargets['Line <2>'], 456);
  assert.equal(draft.lineTargets['Line <1>'], 0);
  assert.equal(draft.rows.length, 0);
  assert.ok(markup('Line <2>').includes('value="456"'));
  assert.equal((markup('').match(/data-line-target=/g) || []).length, 2);
  assert.equal((markup('Removed').match(/data-line-target=/g) || []).length, 1);
});

test('people can be filtered by job and assignments are a separate page', () => {
  const draft = draftFixture();
  const markup = workforceSettingsMarkup({ draft, esc, icon, language: 'en', selectedJob: 'Test' });
  assert.ok(markup.includes('data-person-job-filter'));
  assert.ok(markup.includes('Former colleague'));
  assert.ok(!markup.includes('Alex &lt;Lead&gt;'));
  assert.ok(!markup.includes('staff-line-panel'));
  const assignment = lineStaffingMarkup({ draft, esc, icon, language: 'en' });
  assert.ok(assignment.includes('staff-line-panel'));
  assert.ok(!assignment.includes('personnel-panel'));
});

test('deleting a job deletes active and inactive people and their assignments without an archive view', () => {
  const draft = draftFixture();
  draft.personnel.push({ id: 'person-c', name: 'Another packer', job: 'Pack', active: false });
  draft.lineStaffing['Line <1>'].night.push('person-c');
  draft.models = ['A', 'B'];
  draft.productionUnits = draft.models.map((model) => ({
    line: 'Line <1>',
    model,
    dailyTarget: 100,
    staffing: {
      day: ['person-a'],
      night: ['person-b', 'person-c'],
      owners: ['person-a', 'person-b'],
    },
  }));
  const savedHistory = structuredClone(draft);
  assert.equal(removeCatalogItem(draft, 'jobs', 'Pack'), true);
  assert.deepEqual(
    draft.personnel.map((person) => person.id),
    ['person-b'],
  );
  assert.deepEqual(draft.lineStaffing['Line <1>'], { day: [], night: ['person-b'], owners: [] });
  for (const unit of draft.productionUnits) {
    assert.deepEqual(unit.staffing, { day: [], night: ['person-b'], owners: ['person-b'] });
    assert.equal(unit.dailyTarget, 100);
  }
  const markup = workforceSettingsMarkup({ draft, esc, icon, language: 'en', selectedJob: '' });
  assert.ok(!markup.includes('Archived'));
  assert.ok(!markup.includes('Previous job'));
  assert.ok(!markup.includes('<optgroup'));
  assert.ok(!markup.includes('Alex &lt;Lead&gt;'));
  assert.ok(!markup.includes('Another packer'));
  assert.ok(
    markup.includes('Former colleague'),
    'Inactive people in a current job remain configurable',
  );
  assert.equal(savedHistory.personnel.length, 3);
  assert.deepEqual(savedHistory.lineStaffing['Line <1>'].owners, ['person-a']);
});

test('workforce copy covers matching keys and placeholders in all three languages', () => {
  for (const language of ['en', 'zh', 'th']) {
    assert.deepEqual(
      Object.keys(workforceMessages[language]).sort(),
      Object.keys(workforceMessages.en).sort(),
    );
    for (const [key, value] of Object.entries(workforceMessages[language])) {
      assert.ok(typeof value === 'string' && value.trim(), `${language}.${key}`);
      assert.deepEqual(
        [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
        [...workforceMessages.en[key].matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
        `${language}.${key}`,
      );
    }
  }
});

test('dropdown model pairing and role forms preserve existing targets, owners and hidden units', () => {
  const draft = draftFixture();
  draft.models = ['One', 'Two'];
  draft.productionUnits = draft.models.map((model, index) => ({
    line: 'Line <1>',
    model,
    dailyTarget: 100 + index,
    staffing: { day: ['person-a'], night: ['person-b'], owners: ['person-a'] },
  }));
  const before = structuredClone(draft);
  const html = lineModelsMarkup({ draft, esc, icon, language: 'en' });
  assert.ok(html.includes('data-unit-add-line'));
  assert.ok(html.includes('data-unit-add-model'));
  assert.equal((html.match(/data-configured-unit=/g) || []).length, 2);
  assert.equal((html.match(/data-action="unit-owner"/g) || []).length, 2);
  assert.ok(!html.includes('type="checkbox"'));
  const markup = lineStaffingMarkup({ draft, esc, icon, language: 'en', selectedModel: 'Two' });
  assert.equal((markup.match(/data-staffing-unit=/g) || []).length, 1);
  assert.equal((markup.match(/data-staff-job>/g) || []).length, 3);
  assert.equal((markup.match(/class="staff-person-picker"/g) || []).length, 3);
  assert.ok(markup.includes('Former colleague'));
  assert.ok(markup.includes('Alex &lt;Lead&gt;'));
  assert.ok(!markup.includes('data-staff-person-select'));
  assert.deepEqual(draft, before);
  assert.equal(
    changeStaffAssignment(draft, { line: 'Line <1>', model: 'Two' }, 'owners', 'person-a', false),
    true,
  );
  assert.deepEqual(draft.productionUnits[0], before.productionUnits[0]);
  assert.equal(draft.productionUnits[1].dailyTarget, 101);
  assert.deepEqual(draft.productionUnits[1].staffing.owners, []);
  draft.lines.push('Unused catalog line');
  assert.equal(
    setupReadiness(draft).structure,
    true,
    'A catalog line need not be configured until it is used',
  );
});

test('role-specific help omits manager setup from members and supports all three languages', () => {
  const dayModeLabels = {
    en: 'Whole-day spreadsheet',
    zh: '整日雙班試算表',
    th: 'ตารางทั้งสองกะตลอดวัน',
  };
  for (const language of ['en', 'zh', 'th']) {
    const manager = helpMarkup({ role: 'admin', language });
    const member = helpMarkup({ role: 'operator', language });
    assert.equal((manager.match(/class="panel help-topic"/g) || []).length, 8);
    assert.equal((member.match(/class="panel help-topic"/g) || []).length, 5);
    assert.equal(helpMarkup({ role: 'manager', language }), manager);
    assert.equal(helpMarkup({ role: 'member', language }), member);
    assert.ok(manager.length > member.length);
    assert.ok(!member.includes('1–7 · Configure'));
    assert.ok(!member.includes('第 1～7 步：'));
    assert.ok(!member.includes('ขั้นตอนที่ 1–7 ·'));
    assert.ok(member.includes('Excel'));
    assert.ok(member.includes('SQLite'));
    assert.ok(member.includes(dayModeLabels[language]), 'members can find the whole-day mode');
    assert.ok(
      !member.includes('/guide-images/setup-order.png'),
      'manager setup screenshots stay out of member help',
    );
    assert.ok(
      member.includes('/guide-images/production-entry.png'),
      'entry screenshots are available to members',
    );
  }
  assert.equal(
    helpMarkup({ role: 'member', language: 'unknown' }),
    helpMarkup({ role: 'member', language: 'en' }),
  );
});
