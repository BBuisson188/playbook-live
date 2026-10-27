(function (root) {
  'use strict';

  const STEP_MS = 1650;
  const PAUSE_MS = 1000 / 3;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const lerp = (from, to, t) => from + (to - from) * t;
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function schedule(actions) {
    const firstDelay = actions.findIndex((action) => action.delayed === true);
    const split = firstDelay >= 0 && firstDelay / actions.length < 0.5 ? firstDelay : -1;
    return actions.map((action, index) => {
      if (split < 0) return { action, start: index / actions.length, end: (index + 1) / actions.length };
      if (index < split) return { action, start: index * 0.5 / split, end: (index + 1) * 0.5 / split };
      const count = actions.length - split;
      return { action, start: 0.5 + (index - split) * 0.5 / count, end: 0.5 + (index - split + 1) * 0.5 / count };
    });
  }

  function progress(timing, t) {
    return clamp((t - timing.start) / (timing.end - timing.start));
  }

  const SCREEN_CLEARANCE = 34;

  function pathPoint(action, u) {
    if (!action.control) return { x: lerp(action.from.x, action.to.x, u), y: lerp(action.from.y, action.to.y, u) };
    return {
      x: (1 - u) ** 2 * action.from.x + 2 * (1 - u) * u * action.control.x + u ** 2 * action.to.x,
      y: (1 - u) ** 2 * action.from.y + 2 * (1 - u) * u * action.control.y + u ** 2 * action.to.y
    };
  }

  function screenStopParameter(action) {
    let previous = action.to;
    let distance = 0;
    for (let index = 63; index >= 0; index -= 1) {
      const t = index / 64;
      const point = pathPoint(action, t);
      const segment = Math.hypot(previous.x - point.x, previous.y - point.y);
      if (distance + segment >= SCREEN_CLEARANCE) {
        return (index + 1) / 64 - (SCREEN_CLEARANCE - distance) / segment / 64;
      }
      distance += segment;
      previous = point;
    }
    return 0;
  }

  function actionPosition(action, t) {
    return pathPoint(action, ease(clamp(t)) * (action.type === 'screen' ? screenStopParameter(action) : 1));
  }

  function actionEnd(action) {
    return actionPosition(action, 1);
  }

  function normalizeScreenContinuity(play) {
    if (!play.steps.some((step) => step.actions.some((action) => action.type === 'screen'))) return play;
    const carry = new Map();
    const same = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y) < 0.01;
    for (const step of play.steps) {
      const oldPositions = new Map(step.entities.players.map((player) => [player.id, { x: player.x, y: player.y }]));
      const newPositions = new Map();
      step.entities.players.forEach((player) => {
        const changed = carry.get(player.id);
        if (changed && same(player, changed.old)) Object.assign(player, changed.next);
        newPositions.set(player.id, { x: player.x, y: player.y });
      });
      if (step.entities.ball?.ownerId) {
        const owner = step.entities.players.find((player) => player.id === step.entities.ball.ownerId);
        const old = owner && oldPositions.get(owner.id);
        if (owner && old && !same(owner, old)) {
          step.entities.ball.x += owner.x - old.x;
          step.entities.ball.y += owner.y - old.y;
        }
      }
      step.actions.forEach((action) => {
        const old = oldPositions.get(action.actorId);
        const next = newPositions.get(action.actorId);
        if (same(action.from, old) && next) action.from = { ...next };
        if (action.type === 'pass' && action.targetPlayerId) {
          const oldTarget = oldPositions.get(action.targetPlayerId);
          const nextTarget = newPositions.get(action.targetPlayerId);
          if (oldTarget && nextTarget && same(action.to, { x: oldTarget.x + 22, y: oldTarget.y + 19 })) {
            action.to = { x: nextTarget.x + 22, y: nextTarget.y + 19 };
          }
        }
        if (!['move', 'dribble', 'screen'].includes(action.type)) return;
        oldPositions.set(action.actorId, { ...action.to });
        newPositions.set(action.actorId, actionEnd(action));
      });
      carry.clear();
      newPositions.forEach((next, id) => {
        const old = oldPositions.get(id);
        if (old && !same(old, next)) carry.set(id, { old, next });
      });
    }
    return play;
  }

  function frameEntities(step, t, courtWidth = 565, courtHeight = 800) {
    const entities = JSON.parse(JSON.stringify(step.entities));
    const playerQueues = new Map();
    const timingByAction = new Map();
    const ballPosition = (player) => ({ x: Math.min(courtWidth - 18, player.x + 22), y: Math.min(courtHeight - 18, player.y + 19) });
    const playerAt = (id, time) => {
      const initial = step.entities.players.find((player) => player.id === id);
      if (!initial) return null;
      const player = { ...initial };
      for (const timing of schedule(playerQueues.get(id) || [])) {
        if (time < timing.start) break;
        Object.assign(player, actionPosition(timing.action, progress(timing, time)));
      }
      return player;
    };
    const resolveBall = () => {
      const owner = entities.players.find((player) => player.id === entities.ball?.ownerId);
      if (owner) entities.ball = { ...entities.ball, ...ballPosition(owner), ownerId: owner.id };
    };

    step.actions.forEach((action) => {
      if (!['move', 'dribble', 'screen'].includes(action.type)) return;
      const queue = playerQueues.get(action.actorId) || [];
      queue.push(action);
      playerQueues.set(action.actorId, queue);
    });
    playerQueues.forEach((actions, playerId) => {
      const player = entities.players.find((item) => item.id === playerId);
      const timings = schedule(actions);
      timings.forEach((timing) => timingByAction.set(timing.action, timing));
      if (!player) return;
      for (const timing of timings) {
        if (t < timing.start) break;
        Object.assign(player, actionPosition(timing.action, progress(timing, t)));
      }
    });
    resolveBall();

    // Passes share a ball and play in order; player movement remains parallel.
    const passes = schedule(step.actions.filter((action) => action.type === 'pass'));
    passes.forEach((timing) => timingByAction.set(timing.action, timing));
    step.actions.forEach((action) => {
      if (!['pass', 'dribble'].includes(action.type)) return;
      const timing = timingByAction.get(action);
      if (!timing || t < timing.start) return;
      const amount = progress(timing, t);
      if (action.type === 'dribble') {
        const player = entities.players.find((item) => item.id === action.actorId);
        if (player) entities.ball = {
          ...ballPosition(player), ownerId: player.id,
          dribbleScale: amount > 0 && amount < 1 ? 1 + 0.13 * Math.sin(amount * Math.PI * 12) : 1
        };
        return;
      }
      const actor = playerAt(action.actorId, timing.start);
      const initialOwner = step.entities.players.find((player) => player.id === step.entities.ball?.ownerId);
      const start = action.actorId === 'ball'
        ? entities.ball || (initialOwner ? ballPosition(initialOwner) : step.entities.ball) || action.from
        : ballPosition(actor || action.from);
      const target = entities.players.find((player) => player.id === action.targetPlayerId);
      const end = amount >= 1 && target ? ballPosition(target) : action.to;
      const u = 1 - Math.pow(1 - amount, 3);
      entities.ball = {
        x: lerp(start.x, end.x, u),
        y: lerp(start.y, end.y, u),
        ownerId: amount >= 1 ? action.targetPlayerId || null : null
      };
    });
    resolveBall();
    return entities;
  }

  function advance(review, elapsedMs, stepCount) {
    const next = { index: review.index, progress: review.progress, pauseElapsed: review.progress >= 1 ? review.pauseElapsed || 0 : 0, playing: review.playing };
    if (stepCount < 1) return { ...next, playing: false };
    if (!next.playing) return next;
    let remaining = Math.max(0, elapsedMs) * review.speed;
    while (next.playing) {
      if (next.progress < 1) {
        const consumed = Math.min(remaining, (1 - next.progress) * STEP_MS);
        next.progress = clamp(next.progress + consumed / STEP_MS);
        remaining -= consumed;
        if (next.progress < 1) break;
      }
      if (next.index >= stepCount - 1) {
        next.playing = false;
        next.pauseElapsed = 0;
        break;
      }
      const consumed = Math.min(remaining, PAUSE_MS - next.pauseElapsed);
      next.pauseElapsed += consumed;
      remaining -= consumed;
      if (next.pauseElapsed < PAUSE_MS) break;
      next.index += 1;
      next.progress = 0;
      next.pauseElapsed = 0;
      if (remaining <= 0) break;
    }
    return next;
  }

  function advanceManual(review, elapsedMs, stepCount) {
    const next = { index: review.index, progress: review.progress, pauseElapsed: 0, playing: review.playing, manual: review.manual };
    if (!next.playing || !next.manual || stepCount < 1) return next;
    let remaining = Math.max(0, elapsedMs) * review.speed / STEP_MS;
    if (next.manual.direction > 0) {
      next.progress = clamp(next.progress + remaining);
      if (next.progress >= 1) {
        if (next.index < stepCount - 1) { next.index += 1; next.progress = 0; }
        next.playing = false;
        next.manual = null;
      }
      return next;
    }
    while (next.playing) {
      const consumed = Math.min(remaining, next.progress);
      next.progress = clamp(next.progress - consumed);
      remaining -= consumed;
      if (next.progress > 0) break;
      if (next.index <= next.manual.targetIndex) {
        next.playing = false;
        next.manual = null;
        break;
      }
      next.index -= 1;
      next.progress = 1;
      if (remaining <= 0) break;
    }
    return next;
  }

  const api = { STEP_MS, PAUSE_MS, SCREEN_CLEARANCE, schedule, progress, actionPosition, actionEnd, normalizeScreenContinuity, frameEntities, advance, advanceManual };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlaybackModel = api;
})(globalThis);
