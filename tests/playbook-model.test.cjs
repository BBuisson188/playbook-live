const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../playbook-model.js');
const existing = require('../data/playbook-live.json');

const categories = [
  { id: 'zone', name: 'Zone', hidden: false },
  { id: 'later', name: 'Later', hidden: true }
];
const plays = [
  { id: 'a', name: 'Zone A', categoryId: 'zone' },
  { id: 'b', name: 'Future play', categoryId: 'later' },
  { id: 'c', name: 'Zone C', categoryId: 'zone' },
  { id: 'd', name: 'Old play' }
];

test('existing published JSON needs no migration and retains all plays', () => {
  const result = model.playerSnapshot(existing);
  assert.equal(result.plays.length, existing.plays.length);
  assert.deepEqual(result.categories, []);
});

test('hidden categories and their plays never enter player state', () => {
  const result = model.playerSnapshot({ categories, plays });
  assert.deepEqual(result.plays.map((play) => play.id), ['a', 'c', 'd']);
  assert.deepEqual(result.categories.map((category) => category.id), ['zone']);
  assert.equal(plays.length, 4);
});

test('visibility changes survive JSON export and offline-cache round trips', () => {
  const result = model.playerSnapshot(JSON.parse(JSON.stringify({ categories, plays })));
  assert.equal(result.plays.some((play) => play.id === 'b'), false);
  const visible = model.playerSnapshot({ plays, categories: categories.map((category) => ({ ...category, hidden: false })) });
  assert.equal(visible.plays.length, 4);
});

test('all-hidden playbooks produce an explicit empty visible collection', () => {
  assert.equal(model.playerSnapshot({ categories, plays: [plays[1]] }).plays.length, 0);
});

test('uncategorized includes legacy plays and removed category assignments', () => {
  const result = model.groups([...plays, { id: 'orphan', categoryId: 'missing' }], categories);
  assert.deepEqual(result.at(-1).plays.map((play) => play.id), ['d', 'orphan']);
});

test('search and category filters compose without changing source order', () => {
  assert.deepEqual(model.groups(plays, categories, 'c', 'zone')[0].plays.map((play) => play.id), ['c']);
  assert.equal(model.groups(plays, categories, '', '').length, 1);
  assert.deepEqual(plays.map((play) => play.id), ['a', 'b', 'c', 'd']);
});

test('moving plays swaps category neighbors without disturbing other categories', () => {
  const result = model.movePlay(plays, categories, 'c', 'a');
  assert.deepEqual(result.map((play) => play.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(model.groups(result, categories)[0].plays.map((play) => play.id), ['c', 'a']);
  assert.deepEqual(plays.map((play) => play.id), ['a', 'b', 'c', 'd']);
});

test('cross-category moves and missing targets cannot corrupt order', () => {
  assert.equal(model.movePlay(plays, categories, 'a', 'b'), plays);
  assert.equal(model.movePlay(plays, categories, 'a', ''), plays);
});

test('Last Step trims forty steps while preserving the selected step and every earlier step', () => {
  const play = { steps: Array.from({ length: 40 }, (_, index) => ({ id: String(index) })) };
  const kept = structuredClone(play.steps.slice(0, 6));
  assert.equal(model.trimSteps(play, 5), true);
  assert.deepEqual(play.steps, kept);
  assert.equal(model.trimSteps(play, 5), false);
});

test('deleting a first, middle or final step removes exactly that step', () => {
  for (const index of [0, 1, 2]) {
    const play = { steps: [{ id: 'first' }, { id: 'middle' }, { id: 'last' }] };
    const expected = play.steps.filter((step, position) => position !== index);
    assert.equal(model.deleteStep(play, index), true);
    assert.deepEqual(play.steps, expected);
  }
});

test('the last remaining step and invalid trim positions are protected', () => {
  const play = { steps: [{ id: 'only' }] };
  assert.equal(model.deleteStep(play, 0), false);
  assert.equal(model.trimSteps(play, -1), false);
  assert.equal(model.trimSteps(play, 10), false);
  assert.equal(play.steps.length, 1);
});

test('invalid category metadata is rejected rather than silently making hidden plays visible', () => {
  for (const categories of [null, {}, [{ id: 'a', name: 'A', hidden: 'true' }], [{ id: 'a', name: ' ' }], [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }]]) {
    assert.throws(() => model.readCategories({ categories }));
  }
});

test('previous-motion shadows are per-step, optional, and always use the immediate predecessor', () => {
  const first = { id: 'first', actions: [{ type: 'move' }], showPreviousStep: true };
  const second = { id: 'second', actions: [{ type: 'pass' }], showPreviousStep: true };
  const third = { id: 'third', showPreviousStep: true };
  const play = { steps: [first, second, third] };
  assert.equal(model.previousStepForShadow(play, 0), null);
  assert.equal(model.previousStepForShadow(play, 1), first);
  assert.equal(model.previousStepForShadow(play, 2), second);
  third.showPreviousStep = false;
  assert.equal(model.previousStepForShadow(play, 2), null);
  delete second.showPreviousStep;
  assert.equal(model.previousStepForShadow(play, 1), null);
});

test('inserting or removing a step resolves shadows against the new neighboring step', () => {
  const play = { steps: [{ id: 'a' }, { id: 'b', showPreviousStep: true }] };
  play.steps.splice(1, 0, { id: 'inserted' });
  assert.equal(model.previousStepForShadow(play, 2).id, 'inserted');
  model.deleteStep(play, 1);
  assert.equal(model.previousStepForShadow(play, 1).id, 'a');
  const roundTrip = JSON.parse(JSON.stringify({ schemaVersion: 1, plays: [play] }));
  assert.equal(model.playerSnapshot(roundTrip).plays[0].steps[1].showPreviousStep, true);
});

test('coach public loads use the live published site rather than a local preview origin', () => {
  const url = model.publishedSnapshotUrl({}, 'https://bbuisson188.github.io/playbook-live/player.html', 123);
  assert.equal(url, 'https://bbuisson188.github.io/playbook-live/data/playbook-live.json?v=123');
});

test('public loads honor repository, branch and path without including a token', () => {
  const url = model.publishedSnapshotUrl({ owner: 'Coach', repo: 'Plays', branch: 'practice', path: 'data/zone plays.json', token: 'not-a-real-token' }, 'https://example.com/player.html', 456);
  assert.equal(url, 'https://raw.githubusercontent.com/Coach/Plays/practice/data/zone%20plays.json?v=456');
  assert.equal(url.includes('token'), false);
});
