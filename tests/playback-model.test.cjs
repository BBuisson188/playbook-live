const test = require('node:test');
const assert = require('node:assert/strict');
const playback = require('../playback-model.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
const player = (id, x = 0, y = 0) => ({ id, x, y, side: 'offense', number: 1 });
const move = (type = 'move', delayed = false, actorId = 'p1') => ({ id: 'a1', type, delayed, actorId, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } });
const step = (actions, ball = null) => ({ entities: { players: [player('p1'), player('p2', 100)], ball }, actions });
const review = (extra = {}) => ({ index: 0, progress: 0, pauseElapsed: 0, speed: 1, playing: true, ...extra });

for (const type of ['move', 'screen', 'dribble']) {
  test(`delayed ${type} holds until halfway and finishes at the step end`, () => {
    const input = step([move(type, true)], type === 'dribble' ? { x: 22, y: 19, ownerId: 'p1' } : null);
    assert.equal(playback.frameEntities(input, 0.25).players[0].x, 0);
    assert.equal(playback.frameEntities(input, 0.5).players[0].x, 0);
    const end = type === 'screen' ? 100 - playback.SCREEN_CLEARANCE : 100;
    near(playback.frameEntities(input, 0.75).players[0].x, end / 2);
    near(playback.frameEntities(input, 1).players[0].x, end);
    assert.equal(input.entities.players[0].x, 0);
  });
}

test('normal and delayed movements can run independently in the same step', () => {
  const delayed = { ...move('move', true, 'p2'), from: { x: 100, y: 0 }, to: { x: 200, y: 0 } };
  const frame = playback.frameEntities(step([move(), delayed]), 0.25);
  near(frame.players[0].x, 12.5);
  near(frame.players[1].x, 100);
});

test('curved actions keep their curve when delayed', () => {
  const action = { ...move('move', true), control: { x: 50, y: 100 } };
  const frame = playback.frameEntities(step([action]), 0.75);
  near(frame.players[0].x, 50);
  near(frame.players[0].y, 50);
});

test('delayed dribbles keep the ball with the moving player', () => {
  const input = step([move('dribble', true)], { x: 22, y: 19, ownerId: 'p1' });
  const early = playback.frameEntities(input, 0.25);
  const late = playback.frameEntities(input, 0.75);
  near(early.ball.x, 22);
  near(late.ball.x, late.players[0].x + 22);
  assert.equal(late.ball.ownerId, 'p1');
});

test('a delayed pass retains possession until its start', () => {
  const pass = { ...move('pass', true), to: { x: 122, y: 19 }, targetPlayerId: 'p2' };
  const input = step([pass], { x: 22, y: 19, ownerId: 'p1' });
  assert.equal(playback.frameEntities(input, 0.25).ball.ownerId, 'p1');
  near(playback.frameEntities(input, 0.75).ball.x, 109.5);
  assert.equal(playback.frameEntities(input, 0.75).ball.ownerId, null);
  assert.equal(playback.frameEntities(input, 1).ball.ownerId, 'p2');
});

test('chained cuts stay ordered and a delayed segment never begins before halfway', () => {
  const actions = [move(), { ...move('move', true), id: 'a2', from: { x: 100, y: 0 }, to: { x: 200, y: 0 } }, { ...move(), id: 'a3', from: { x: 200, y: 0 }, to: { x: 300, y: 0 } }];
  const times = playback.schedule(actions);
  near(times[1].start, 0.5);
  for (let index = 1; index < times.length; index += 1) near(times[index - 1].end, times[index].start);
  near(times.at(-1).end, 1);
  near(playback.frameEntities(step(actions), 0.5).players[0].x, 100);
  near(playback.frameEntities(step(actions), 1).players[0].x, 300);
});

test('multiple passes animate in order rather than overwriting the first pass', () => {
  const passes = [
    { ...move('pass'), actorId: 'ball', from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
    { ...move('pass'), id: 'p2', actorId: 'ball', from: { x: 100, y: 0 }, to: { x: 200, y: 0 } }
  ];
  const input = step(passes, { x: 0, y: 0, ownerId: null });
  near(playback.frameEntities(input, 0.25).ball.x, 87.5);
  near(playback.frameEntities(input, 0.75).ball.x, 187.5);
});

test('a carried ball follows a cut throughout animation', () => {
  const frame = playback.frameEntities(step([move()], { x: 22, y: 19, ownerId: 'p1' }), 0.5);
  near(frame.ball.x, frame.players[0].x + 22);
});

test('delayed passes leave from the actor position at the delayed start', () => {
  const pass = { ...move('pass', true), to: { x: 122, y: 19 }, targetPlayerId: 'p2' };
  const frame = playback.frameEntities(step([move(), pass], { x: 22, y: 19, ownerId: 'p1' }), 0.5);
  near(frame.ball.x, 72);
});

test('the end frame is held for a third of a second before advancing', () => {
  let state = playback.advance(review(), playback.STEP_MS, 3);
  assert.equal(state.index, 0);
  near(state.progress, 1);
  assert.equal(state.playing, true);
  state = playback.advance({ ...state, speed: 1 }, 200, 3);
  assert.equal(state.index, 0);
  near(state.pauseElapsed, 200);
  state = playback.advance({ ...state, speed: 1 }, playback.PAUSE_MS - 200, 3);
  assert.equal(state.index, 1);
  near(state.progress, 0);
});

test('pause and resume preserve a partly completed inter-step pause', () => {
  const paused = review({ progress: 1, pauseElapsed: 150, playing: false });
  near(playback.advance(paused, 1000, 3).pauseElapsed, 150);
  const resumed = playback.advance({ ...paused, playing: true }, playback.PAUSE_MS - 150, 3);
  assert.equal(resumed.index, 1);
});

test('pausing during an action preserves its exact progress', () => {
  const result = playback.advance(review({ progress: 0.4, playing: false }), 500, 3);
  near(result.progress, 0.4);
});

for (const speed of [0.5, 1, 2]) {
  test(`speed ${speed} scales movement duration and the inter-step pause together`, () => {
    const state = playback.advance(review({ speed }), (playback.STEP_MS + playback.PAUSE_MS + 100) / speed, 3);
    assert.equal(state.index, 1);
    near(state.progress, 100 / playback.STEP_MS);
  });
}

test('playback finishes on the last step with no extra trailing pause', () => {
  const state = playback.advance(review(), playback.STEP_MS * 3 + playback.PAUSE_MS * 2, 3);
  assert.equal(state.index, 2);
  near(state.progress, 1);
  assert.equal(state.playing, false);
});

test('single-step plays finish normally and large frame deltas cannot overrun a play', () => {
  const single = playback.advance(review(), playback.STEP_MS, 1);
  assert.equal(single.playing, false);
  const large = playback.advance(review(), 1000000, 40);
  assert.equal(large.index, 39);
  assert.equal(large.playing, false);
  assert.equal(playback.advance(review(), 100, 0).playing, false);
});

test('delay settings survive a normal JSON round trip', () => {
  const saved = JSON.parse(JSON.stringify(step([move('move', true)])));
  assert.equal(saved.actions[0].delayed, true);
  near(playback.frameEntities(saved, 0.25).players[0].x, 0);
});

test('screens stop short while their authored T endpoint stays unchanged', () => {
  const action = move('screen');
  const frame = playback.frameEntities(step([action]), 1);
  near(frame.players[0].x, 66);
  near(action.to.x, 100);
  assert.ok(Math.hypot(action.to.x - frame.players[0].x, action.to.y - frame.players[0].y) > 28);
});

test('curved screen paths stop before the T without flattening the curve', () => {
  const action = { ...move('screen'), control: { x: 50, y: 80 } };
  const end = playback.actionEnd(action);
  assert.ok(end.y > 0);
  const distance = Math.hypot(end.x - action.to.x, end.y - action.to.y);
  assert.ok(distance > 30 && distance < 35);
  assert.deepEqual(action.to, { x: 100, y: 0 });
});

test('a short screen cannot move the player backwards to make room', () => {
  const action = { ...move('screen'), to: { x: 20, y: 0 } };
  assert.deepEqual(playback.actionEnd(action), action.from);
});

test('existing screen endpoints migrate across stationary steps and into a following cut', () => {
  const input = { steps: [
    step([move('screen')]),
    { entities: { players: [player('p1', 100)], ball: { x: 122, y: 19, ownerId: 'p1' } }, actions: [] },
    { entities: { players: [player('p1', 100)], ball: null }, actions: [{ ...move(), from: { x: 100, y: 0 }, to: { x: 200, y: 0 } }] }
  ] };
  playback.normalizeScreenContinuity(input);
  near(input.steps[1].entities.players[0].x, 66);
  near(input.steps[1].entities.ball.x, 88);
  near(input.steps[2].entities.players[0].x, 66);
  near(input.steps[2].actions[0].from.x, 66);
  near(input.steps[2].actions[0].to.x, 200);
  const once = JSON.stringify(input);
  playback.normalizeScreenContinuity(input);
  assert.equal(JSON.stringify(input), once, 'screen normalization must be idempotent');
});

test('screen continuity leaves deliberately independent player positions alone', () => {
  const input = { steps: [step([move('screen')]), { entities: { players: [player('p1', 250)], ball: null }, actions: [] }] };
  playback.normalizeScreenContinuity(input);
  near(input.steps[1].entities.players[0].x, 250);
});

test('dribbles pulse above and below normal size while keeping the ball attached', () => {
  const input = step([move('dribble')], { x: 22, y: 19, ownerId: 'p1' });
  const large = playback.frameEntities(input, 1 / 24);
  const small = playback.frameEntities(input, 3 / 24);
  assert.ok(large.ball.dribbleScale > 1);
  assert.ok(small.ball.dribbleScale < 1);
  near(large.ball.x, large.players[0].x + 22);
  near(playback.frameEntities(input, 0).ball.dribbleScale, 1);
  near(playback.frameEntities(input, 1).ball.dribbleScale, 1);
  assert.equal(input.entities.ball.dribbleScale, undefined);
});

test('delayed dribbles do not pulse before the action begins', () => {
  const input = step([move('dribble', true)], { x: 22, y: 19, ownerId: 'p1' });
  assert.equal(playback.frameEntities(input, 0.25).ball.dribbleScale, undefined);
  assert.ok(playback.frameEntities(input, 0.5 + 1 / 48).ball.dribbleScale > 1);
});

test('manual Next animates the current step then lands at the next step start', () => {
  const manual = { direction: 1, targetIndex: 1 };
  const middle = playback.advanceManual(review({ manual }), playback.STEP_MS / 2, 3);
  assert.equal(middle.index, 0);
  near(middle.progress, 0.5);
  assert.equal(middle.playing, true);
  const end = playback.advanceManual({ ...middle, speed: 1 }, playback.STEP_MS / 2, 3);
  assert.equal(end.index, 1);
  near(end.progress, 0);
  assert.equal(end.playing, false);
  assert.equal(end.manual, null);
});

test('manual Back plays the preceding step backwards instead of jumping', () => {
  const manual = { direction: -1, targetIndex: 0 };
  const middle = playback.advanceManual(review({ index: 1, manual }), playback.STEP_MS / 2, 3);
  assert.equal(middle.index, 0);
  near(middle.progress, 0.5);
  assert.equal(middle.playing, true);
  const end = playback.advanceManual({ ...middle, speed: 1 }, playback.STEP_MS / 2, 3);
  near(end.progress, 0);
  assert.equal(end.playing, false);
});

test('Back from a partly played step reverses to its start before reversing the previous step', () => {
  const middle = playback.advanceManual(review({ index: 2, progress: 0.5, manual: { direction: -1, targetIndex: 1 } }), playback.STEP_MS, 4);
  assert.equal(middle.index, 1);
  near(middle.progress, 0.5);
  const end = playback.advanceManual({ ...middle, speed: 1 }, playback.STEP_MS / 2, 4);
  assert.equal(end.index, 1);
  near(end.progress, 0);
  assert.equal(end.playing, false);
});

test('manual stepping respects speed and can finish the final step', () => {
  const end = playback.advanceManual(review({ index: 2, speed: 2, manual: { direction: 1, targetIndex: 2 } }), playback.STEP_MS / 2, 3);
  assert.equal(end.index, 2);
  near(end.progress, 1);
  assert.equal(end.playing, false);
});
