(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COURT = { width: 600, height: 900, playerRadius: 24, ballRadius: 13 };
  const STORAGE = {
    plays: 'playbook-live:plays:v1',
    current: 'playbook-live:current-play-id:v1',
    github: 'playbook-live:github-settings:v1'
  };

  const ACTION_LABELS = {
    move: 'Cut / movement',
    pass: 'Pass',
    dribble: 'Dribble',
    screen: 'Screen'
  };

  const ACTION_CLASS = {
    move: 'action-move',
    pass: 'action-pass',
    dribble: 'action-dribble',
    screen: 'action-screen'
  };

  const state = {
    tool: 'select',
    screen: 'create',
    plays: [],
    currentPlay: null,
    currentStepIndex: 0,
    selected: null,
    drag: null,
    draftAction: null,
    undoStack: [],
    redoStack: [],
    review: {
      index: 0,
      progress: 0,
      playing: false,
      lastTs: 0,
      speed: 1,
      raf: null
    }
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    loadLocalPlays();
    loadOrCreateCurrentPlay();
    loadGitHubSettingsIntoForm();
    attachEvents();
    renderAll();
    registerServiceWorker();
  }

  function cacheElements() {
    Object.assign(els, {
      courtSvg: document.getElementById('courtSvg'),
      reviewSvg: document.getElementById('reviewSvg'),
      playName: document.getElementById('playName'),
      stepChip: document.getElementById('stepChip'),
      reviewStepChip: document.getElementById('reviewStepChip'),
      reviewTitle: document.getElementById('reviewTitle'),
      selectionPanel: document.getElementById('selectionPanel'),
      toast: document.getElementById('toast'),
      undoBtn: document.getElementById('undoBtn'),
      redoBtn: document.getElementById('redoBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      prevStepBtn: document.getElementById('prevStepBtn'),
      nextStepBtn: document.getElementById('nextStepBtn'),
      addBlankStepBtn: document.getElementById('addBlankStepBtn'),
      deleteStepBtn: document.getElementById('deleteStepBtn'),
      savePlayBtn: document.getElementById('savePlayBtn'),
      exportPlayBtn: document.getElementById('exportPlayBtn'),
      newPlayBtn: document.getElementById('newPlayBtn'),
      importPlayBtn: document.getElementById('importPlayBtn'),
      importFile: document.getElementById('importFile'),
      saveGitHubBtn: document.getElementById('saveGitHubBtn'),
      loadGitHubBtn: document.getElementById('loadGitHubBtn'),
      playList: document.getElementById('playList'),
      settingsDialog: document.getElementById('settingsDialog'),
      ghOwner: document.getElementById('ghOwner'),
      ghRepo: document.getElementById('ghRepo'),
      ghBranch: document.getElementById('ghBranch'),
      ghPath: document.getElementById('ghPath'),
      ghToken: document.getElementById('ghToken'),
      saveSettingsBtn: document.getElementById('saveSettingsBtn'),
      clearGitHubBtn: document.getElementById('clearGitHubBtn'),
      reviewBackBtn: document.getElementById('reviewBackBtn'),
      reviewForwardBtn: document.getElementById('reviewForwardBtn'),
      playPauseBtn: document.getElementById('playPauseBtn'),
      restartBtn: document.getElementById('restartBtn'),
      speedSlider: document.getElementById('speedSlider')
    });
  }

  function attachEvents() {
    document.querySelectorAll('.tool-button').forEach((button) => {
      button.addEventListener('click', () => setTool(button.dataset.tool));
    });

    document.querySelectorAll('.nav-button').forEach((button) => {
      button.addEventListener('click', () => setScreen(button.dataset.screen));
    });

    els.courtSvg.addEventListener('pointerdown', onCourtPointerDown);
    els.courtSvg.addEventListener('pointermove', onCourtPointerMove);
    els.courtSvg.addEventListener('pointerup', onCourtPointerUp);
    els.courtSvg.addEventListener('pointercancel', onCourtPointerUp);

    els.playName.addEventListener('input', () => {
      state.currentPlay.name = els.playName.value.trim() || 'Untitled Play';
      state.currentPlay.updatedAt = new Date().toISOString();
      renderLibrary();
    });

    els.undoBtn.addEventListener('click', undo);
    els.redoBtn.addEventListener('click', redo);
    els.settingsBtn.addEventListener('click', () => els.settingsDialog.showModal());

    els.prevStepBtn.addEventListener('click', goPreviousStep);
    els.nextStepBtn.addEventListener('click', goNextOrCreateStep);
    els.addBlankStepBtn.addEventListener('click', addBlankStepAfterCurrent);
    els.deleteStepBtn.addEventListener('click', deleteCurrentStep);
    els.savePlayBtn.addEventListener('click', () => {
      saveCurrentPlayToLibrary();
      showToast('Play saved');
    });
    els.exportPlayBtn.addEventListener('click', () => exportJson(state.currentPlay, slugify(state.currentPlay.name) + '.json'));

    els.newPlayBtn.addEventListener('click', () => {
      checkpoint();
      state.currentPlay = createNewPlay();
      state.currentStepIndex = 0;
      state.selected = null;
      saveCurrentPlayId();
      setScreen('create');
      renderAll();
    });

    els.importPlayBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', importJsonFile);
    els.saveGitHubBtn.addEventListener('click', savePlaybookToGitHub);
    els.loadGitHubBtn.addEventListener('click', loadPlaybookFromGitHub);

    els.saveSettingsBtn.addEventListener('click', saveGitHubSettingsFromForm);
    els.clearGitHubBtn.addEventListener('click', clearGitHubSettings);

    els.reviewBackBtn.addEventListener('click', () => jumpReviewStep(state.review.index - 1));
    els.reviewForwardBtn.addEventListener('click', () => jumpReviewStep(state.review.index + 1));
    els.playPauseBtn.addEventListener('click', togglePlayback);
    els.restartBtn.addEventListener('click', restartPlayback);
    els.speedSlider.addEventListener('input', () => {
      state.review.speed = Number(els.speedSlider.value);
    });

    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selected && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
          event.preventDefault();
          deleteSelected();
        }
      }
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  function createNewPlay() {
    const id = uid('play');
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      id,
      name: 'New Play',
      description: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
      steps: [createStep()]
    };
  }

  function createStep(entities = null) {
    return {
      id: uid('step'),
      notes: '',
      entities: entities ? clone(entities) : { players: [], ball: null },
      actions: []
    };
  }

  function loadLocalPlays() {
    try {
      state.plays = JSON.parse(localStorage.getItem(STORAGE.plays) || '[]');
      if (!Array.isArray(state.plays)) state.plays = [];
    } catch {
      state.plays = [];
    }
  }

  function persistLocalPlays() {
    localStorage.setItem(STORAGE.plays, JSON.stringify(state.plays));
  }

  function saveCurrentPlayId() {
    localStorage.setItem(STORAGE.current, state.currentPlay.id);
  }

  function loadOrCreateCurrentPlay() {
    const currentId = localStorage.getItem(STORAGE.current);
    const saved = state.plays.find((play) => play.id === currentId) || state.plays[0];
    state.currentPlay = saved ? clone(saved) : createNewPlay();
    saveCurrentPlayId();
  }

  function saveCurrentPlayToLibrary() {
    normalizePlay(state.currentPlay);
    state.currentPlay.updatedAt = new Date().toISOString();
    const index = state.plays.findIndex((play) => play.id === state.currentPlay.id);
    if (index >= 0) state.plays[index] = clone(state.currentPlay);
    else state.plays.unshift(clone(state.currentPlay));
    persistLocalPlays();
    saveCurrentPlayId();
    renderLibrary();
  }

  function normalizePlay(play) {
    play.schemaVersion = 1;
    if (!Array.isArray(play.steps) || play.steps.length === 0) play.steps = [createStep()];
    play.steps.forEach((step) => {
      if (!step.id) step.id = uid('step');
      if (!step.entities) step.entities = { players: [], ball: null };
      if (!Array.isArray(step.entities.players)) step.entities.players = [];
      if (!Array.isArray(step.actions)) step.actions = [];
    });
  }

  function setTool(tool) {
    state.tool = tool;
    state.selected = null;
    state.draftAction = null;
    document.querySelectorAll('.tool-button').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === tool);
    });
    renderCreate();
  }

  function setScreen(screen) {
    state.screen = screen;
    document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.screen === screen));
    document.querySelectorAll('.screen').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`${screen}Screen`).classList.add('active');
    if (screen === 'playbook') renderLibrary();
    if (screen === 'review') {
      state.review.index = Math.min(state.review.index, state.currentPlay.steps.length - 1);
      renderReview();
    }
  }

  function currentStep() {
    return state.currentPlay.steps[state.currentStepIndex];
  }

  function getPointerPosition(svg, event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
    return clampPoint(transformed);
  }

  function clampPoint(point) {
    return {
      x: Math.max(26, Math.min(COURT.width - 26, point.x)),
      y: Math.max(26, Math.min(COURT.height - 26, point.y))
    };
  }

  function onCourtPointerDown(event) {
    const pointer = getPointerPosition(els.courtSvg, event);
    const target = event.target.closest('[data-entity-kind], [data-action-id], [data-handle-action-id]');
    els.courtSvg.setPointerCapture(event.pointerId);

    if (target?.dataset.handleActionId) {
      checkpoint();
      state.selected = { kind: 'action', id: target.dataset.handleActionId };
      state.drag = { mode: 'handle', actionId: target.dataset.handleActionId, handle: target.dataset.handleKind || 'to' };
      renderCreate();
      return;
    }

    if (target?.dataset.actionId) {
      if (state.tool === 'erase') {
        checkpoint();
        removeAction(target.dataset.actionId);
        renderCreate();
        return;
      }
      state.selected = { kind: 'action', id: target.dataset.actionId };
      renderCreate();
      return;
    }

    if (target?.dataset.entityKind === 'player') {
      const playerId = target.dataset.entityId;
      if (state.tool === 'erase') {
        checkpoint();
        removePlayer(playerId);
        renderCreate();
        return;
      }
      if (['move', 'pass', 'dribble', 'screen'].includes(state.tool)) {
        beginDraftAction(state.tool, playerId, pointer);
        return;
      }
      if (state.tool === 'ball') {
        checkpoint();
        attachBallToPlayer(playerId);
        renderCreate();
        showToast('Ball assigned');
        return;
      }
      state.selected = { kind: 'player', id: playerId };
      checkpoint();
      state.drag = { mode: 'entity', kind: 'player', id: playerId, changed: false };
      renderCreate();
      return;
    }

    if (target?.dataset.entityKind === 'ball') {
      if (state.tool === 'erase') {
        checkpoint();
        currentStep().entities.ball = null;
        recomputeFollowingStepsFrom(state.currentStepIndex);
        state.selected = null;
        renderCreate();
        return;
      }
      if (state.tool === 'pass') {
        beginDraftAction('pass', 'ball', pointer);
        return;
      }
      state.selected = { kind: 'ball', id: 'ball' };
      checkpoint();
      state.drag = { mode: 'entity', kind: 'ball', id: 'ball', changed: false };
      renderCreate();
      return;
    }

    if (state.tool === 'offense' || state.tool === 'defense') {
      checkpoint();
      addPlayer(state.tool, pointer);
      renderCreate();
      return;
    }

    if (state.tool === 'ball') {
      checkpoint();
      placeBall(pointer);
      renderCreate();
      return;
    }

    state.selected = null;
    renderCreate();
  }

  function onCourtPointerMove(event) {
    const pointer = getPointerPosition(els.courtSvg, event);

    if (state.draftAction) {
      state.draftAction.to = pointer;
      renderCreate();
      return;
    }

    if (!state.drag) return;

    if (state.drag.mode === 'entity') {
      state.drag.changed = true;
      if (state.drag.kind === 'player') {
        const player = findPlayer(currentStep(), state.drag.id);
        if (!player) return;
        player.x = pointer.x;
        player.y = pointer.y;
        syncActionStartsForEntity(currentStep(), player.id);
        if (currentStep().entities.ball?.ownerId === player.id) {
          currentStep().entities.ball.x = pointer.x + 22;
          currentStep().entities.ball.y = pointer.y + 19;
        }
      } else {
        const ball = currentStep().entities.ball;
        if (!ball) return;
        ball.ownerId = null;
        ball.x = pointer.x;
        ball.y = pointer.y;
      }
      renderCreate(false);
      return;
    }

    if (state.drag.mode === 'handle') {
      const action = findAction(currentStep(), state.drag.actionId);
      if (!action) return;
      action.to = pointer;
      if (action.type === 'pass') {
        const target = findNearestPlayer(currentStep(), pointer, 38);
        action.targetPlayerId = target?.id || null;
        if (target) action.to = playerBallPosition(target);
      }
      recomputeFollowingStepsFrom(state.currentStepIndex);
      renderCreate(false);
    }
  }

  function onCourtPointerUp(event) {
    try { els.courtSvg.releasePointerCapture(event.pointerId); } catch {}

    if (state.draftAction) {
      finishDraftAction();
      return;
    }

    if (state.drag?.mode === 'entity' && state.drag.changed) {
      if (state.drag.kind === 'player') {
        const player = findPlayer(currentStep(), state.drag.id);
        if (player) reconcileEditedStart('player', player.id, { x: player.x, y: player.y });
      } else {
        const ball = currentStep().entities.ball;
        if (ball) {
          const near = findNearestPlayer(currentStep(), ball, 35);
          if (near) {
            ball.ownerId = near.id;
            const pos = playerBallPosition(near);
            ball.x = pos.x;
            ball.y = pos.y;
          }
          reconcileEditedStart('ball', 'ball', { x: ball.x, y: ball.y, ownerId: ball.ownerId || null });
        }
      }
      state.currentPlay.updatedAt = new Date().toISOString();
    }

    if (state.drag?.mode === 'handle') {
      recomputeFollowingStepsFrom(state.currentStepIndex);
      state.currentPlay.updatedAt = new Date().toISOString();
    }

    state.drag = null;
    renderCreate();
  }

  function beginDraftAction(type, actorId, pointer) {
    const step = currentStep();
    const actorPos = getActorPosition(step, actorId);
    if (!actorPos) return;
    if (type === 'dribble') {
      const player = findPlayer(step, actorId);
      if (!player) {
        showToast('Start dribble from a player');
        return;
      }
      if (!step.entities.ball) {
        step.entities.ball = { x: player.x + 22, y: player.y + 19, ownerId: player.id };
      } else if (!step.entities.ball.ownerId) {
        step.entities.ball.ownerId = player.id;
      }
    }
    if (type === 'screen' && actorId === 'ball') return;
    checkpoint();
    state.selected = null;
    state.draftAction = {
      id: uid('act'),
      type,
      actorId,
      from: actorPos,
      to: pointer,
      targetPlayerId: null
    };
  }

  function finishDraftAction() {
    const action = state.draftAction;
    state.draftAction = null;
    if (distance(action.from, action.to) < 18) {
      renderCreate();
      return;
    }
    if (action.type === 'pass') {
      const target = findNearestPlayer(currentStep(), action.to, 42);
      if (target) {
        action.targetPlayerId = target.id;
        action.to = playerBallPosition(target);
      }
      if (!currentStep().entities.ball && action.actorId !== 'ball') {
        const actor = findPlayer(currentStep(), action.actorId);
        if (actor) currentStep().entities.ball = { ...playerBallPosition(actor), ownerId: actor.id };
      }
    }
    currentStep().actions.push(action);
    state.selected = { kind: 'action', id: action.id };
    recomputeFollowingStepsFrom(state.currentStepIndex);
    state.currentPlay.updatedAt = new Date().toISOString();
    renderCreate();
  }

  function addPlayer(side, point) {
    const step = currentStep();
    const count = step.entities.players.filter((player) => player.side === side).length;
    if (count >= 5) {
      showToast(`${capitalize(side)} already has 5 players`);
      return;
    }
    const used = new Set(step.entities.players.filter((player) => player.side === side).map((player) => player.number));
    let number = 1;
    while (used.has(number) && number <= 5) number += 1;
    const player = {
      id: uid(side === 'offense' ? 'o' : 'd'),
      side,
      number,
      x: point.x,
      y: point.y
    };
    step.entities.players.push(player);
    state.selected = { kind: 'player', id: player.id };
    recomputeFollowingStepsFrom(state.currentStepIndex);
  }

  function placeBall(point) {
    const near = findNearestPlayer(currentStep(), point, 35);
    if (near) {
      currentStep().entities.ball = { ...playerBallPosition(near), ownerId: near.id };
      state.selected = { kind: 'ball', id: 'ball' };
      showToast('Ball attached to player');
    } else {
      currentStep().entities.ball = { x: point.x, y: point.y, ownerId: null };
      state.selected = { kind: 'ball', id: 'ball' };
    }
    recomputeFollowingStepsFrom(state.currentStepIndex);
  }

  function attachBallToPlayer(playerId) {
    const player = findPlayer(currentStep(), playerId);
    if (!player) return;
    currentStep().entities.ball = { ...playerBallPosition(player), ownerId: player.id };
    state.selected = { kind: 'ball', id: 'ball' };
    recomputeFollowingStepsFrom(state.currentStepIndex);
  }

  function removePlayer(playerId) {
    const step = currentStep();
    step.entities.players = step.entities.players.filter((player) => player.id !== playerId);
    step.actions = step.actions.filter((action) => action.actorId !== playerId && action.targetPlayerId !== playerId);
    if (step.entities.ball?.ownerId === playerId) step.entities.ball.ownerId = null;
    state.selected = null;
    recomputeFollowingStepsFrom(state.currentStepIndex);
  }

  function removeAction(actionId) {
    currentStep().actions = currentStep().actions.filter((action) => action.id !== actionId);
    if (state.selected?.id === actionId) state.selected = null;
    recomputeFollowingStepsFrom(state.currentStepIndex);
  }

  function deleteSelected() {
    if (!state.selected) return;
    checkpoint();
    if (state.selected.kind === 'player') removePlayer(state.selected.id);
    if (state.selected.kind === 'ball') currentStep().entities.ball = null;
    if (state.selected.kind === 'action') removeAction(state.selected.id);
    state.selected = null;
    recomputeFollowingStepsFrom(state.currentStepIndex);
    renderCreate();
  }

  function goPreviousStep() {
    if (state.currentStepIndex <= 0) return;
    state.currentStepIndex -= 1;
    state.selected = null;
    renderCreate();
  }

  function goNextOrCreateStep() {
    if (state.currentStepIndex < state.currentPlay.steps.length - 1) {
      state.currentStepIndex += 1;
      state.selected = null;
      renderCreate();
      return;
    }
    checkpoint();
    const nextEntities = deriveEndEntities(currentStep());
    state.currentPlay.steps.push(createStep(nextEntities));
    state.currentStepIndex += 1;
    state.selected = null;
    state.currentPlay.updatedAt = new Date().toISOString();
    renderCreate();
  }

  function addBlankStepAfterCurrent() {
    checkpoint();
    state.currentPlay.steps.splice(state.currentStepIndex + 1, 0, createStep());
    state.currentStepIndex += 1;
    state.selected = null;
    state.currentPlay.updatedAt = new Date().toISOString();
    renderCreate();
  }

  function deleteCurrentStep() {
    if (state.currentPlay.steps.length === 1) {
      showToast('A play needs at least one step');
      return;
    }
    checkpoint();
    state.currentPlay.steps.splice(state.currentStepIndex, 1);
    state.currentStepIndex = Math.min(state.currentStepIndex, state.currentPlay.steps.length - 1);
    state.selected = null;
    state.currentPlay.updatedAt = new Date().toISOString();
    recomputeFollowingStepsFrom(Math.max(0, state.currentStepIndex - 1));
    renderCreate();
  }

  function deriveEndEntities(step) {
    const entities = clone(step.entities);
    if (!entities.ball) entities.ball = null;
    const hasBallAction = step.actions.some((action) => action.type === 'pass' || action.type === 'dribble');

    step.actions.forEach((action) => {
      if (action.type === 'move' || action.type === 'screen') {
        const player = entities.players.find((item) => item.id === action.actorId);
        if (player) {
          player.x = action.to.x;
          player.y = action.to.y;
        }
      }

      if (action.type === 'dribble') {
        const player = entities.players.find((item) => item.id === action.actorId);
        if (player) {
          player.x = action.to.x;
          player.y = action.to.y;
          entities.ball = { ...playerBallPosition(player), ownerId: player.id };
        }
      }

      if (action.type === 'pass') {
        const target = action.targetPlayerId ? entities.players.find((item) => item.id === action.targetPlayerId) : null;
        if (target) entities.ball = { ...playerBallPosition(target), ownerId: target.id };
        else entities.ball = { x: action.to.x, y: action.to.y, ownerId: null };
      }
    });

    if (entities.ball?.ownerId) {
      const owner = entities.players.find((player) => player.id === entities.ball.ownerId);
      if (owner) entities.ball = { ...playerBallPosition(owner), ownerId: owner.id };
      else entities.ball.ownerId = null;
    }

    if (!hasBallAction && entities.ball?.ownerId) {
      const owner = entities.players.find((player) => player.id === entities.ball.ownerId);
      if (owner) entities.ball = { ...playerBallPosition(owner), ownerId: owner.id };
    }

    return entities;
  }

  function recomputeFollowingStepsFrom(index) {
    const steps = state.currentPlay.steps;
    const start = Math.max(0, Math.min(index, steps.length - 1));
    for (let i = start; i < steps.length - 1; i += 1) {
      steps[i + 1].entities = deriveEndEntities(steps[i]);
      refreshActionStarts(steps[i + 1]);
    }
  }

  function refreshActionStarts(step) {
    step.actions.forEach((action) => {
      const pos = getActorPosition(step, action.actorId);
      if (pos) action.from = pos;
      if (action.type === 'pass' && action.targetPlayerId) {
        const target = findPlayer(step, action.targetPlayerId);
        if (target) action.to = playerBallPosition(target);
      }
    });
  }

  function syncActionStartsForEntity(step, entityId) {
    step.actions.forEach((action) => {
      if (action.actorId === entityId) {
        const pos = getActorPosition(step, action.actorId);
        if (pos) action.from = pos;
      }
      if (action.type === 'pass' && action.targetPlayerId === entityId) {
        const target = findPlayer(step, entityId);
        if (target) action.to = playerBallPosition(target);
      }
    });
  }

  function reconcileEditedStart(kind, id, pos) {
    if (state.currentStepIndex > 0) {
      const previous = state.currentPlay.steps[state.currentStepIndex - 1];
      if (kind === 'player') {
        const previousAction = [...previous.actions].reverse().find((action) =>
          ['move', 'dribble', 'screen'].includes(action.type) && action.actorId === id
        );
        if (previousAction) previousAction.to = { x: pos.x, y: pos.y };
        else {
          const previousPlayer = findPlayer(previous, id);
          if (previousPlayer) {
            previousPlayer.x = pos.x;
            previousPlayer.y = pos.y;
          }
        }
      }
      if (kind === 'ball') {
        const previousBallAction = [...previous.actions].reverse().find((action) => action.type === 'pass' || action.type === 'dribble');
        if (previousBallAction && previousBallAction.type === 'pass') {
          previousBallAction.to = { x: pos.x, y: pos.y };
          previousBallAction.targetPlayerId = pos.ownerId || null;
        } else {
          previous.entities.ball = { x: pos.x, y: pos.y, ownerId: pos.ownerId || null };
        }
      }
      recomputeFollowingStepsFrom(state.currentStepIndex - 1);
    } else {
      recomputeFollowingStepsFrom(0);
    }
    refreshActionStarts(currentStep());
  }

  function renderAll() {
    renderCreate();
    renderLibrary();
    renderReview();
  }

  function renderCreate(skipPanel = false) {
    els.playName.value = state.currentPlay.name || 'Untitled Play';
    els.stepChip.textContent = `Step ${state.currentStepIndex + 1} of ${state.currentPlay.steps.length}`;
    els.prevStepBtn.disabled = state.currentStepIndex === 0;
    els.deleteStepBtn.disabled = state.currentPlay.steps.length === 1;
    els.nextStepBtn.textContent = state.currentStepIndex === state.currentPlay.steps.length - 1 ? 'Next Step' : 'Next Step ›';
    els.undoBtn.disabled = state.undoStack.length === 0;
    els.redoBtn.disabled = state.redoStack.length === 0;
    renderCourt(els.courtSvg, currentStep(), {
      selected: state.selected,
      draftAction: state.draftAction,
      interactive: true,
      showHandles: true
    });
    if (!skipPanel) renderSelectionPanel();
  }

  function renderSelectionPanel() {
    const panel = els.selectionPanel;
    if (!state.selected) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }

    let title = '';
    let sub = '';
    const step = currentStep();

    if (state.selected.kind === 'player') {
      const player = findPlayer(step, state.selected.id);
      if (!player) return;
      title = `${player.side === 'offense' ? 'Blue offense' : 'Red defense'} ${player.number}`;
      sub = 'Drag to edit the start of this step. Adjacent steps stay linked.';
    }

    if (state.selected.kind === 'ball') {
      const ball = step.entities.ball;
      if (!ball) return;
      const owner = ball.ownerId ? findPlayer(step, ball.ownerId) : null;
      title = 'Basketball';
      sub = owner ? `Attached to ${owner.side === 'offense' ? 'blue' : 'red'} ${owner.number}` : 'Free ball position';
    }

    if (state.selected.kind === 'action') {
      const action = findAction(step, state.selected.id);
      if (!action) return;
      title = ACTION_LABELS[action.type];
      sub = 'Drag the white endpoint handle to edit the action.';
    }

    panel.innerHTML = `
      <div>
        <div class="selection-title">${escapeHtml(title)}</div>
        <div class="selection-sub">${escapeHtml(sub)}</div>
      </div>
      <div class="selection-actions">
        ${state.selected.kind === 'player' ? '<button class="pill-button secondary" data-panel-action="give-ball">Give Ball</button>' : ''}
        ${state.selected.kind === 'ball' ? '<button class="pill-button secondary" data-panel-action="detach-ball">Detach</button>' : ''}
        <button class="pill-button danger" data-panel-action="delete">Delete</button>
      </div>`;

    panel.querySelectorAll('[data-panel-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.panelAction;
        if (action === 'delete') deleteSelected();
        if (action === 'give-ball' && state.selected?.kind === 'player') {
          checkpoint();
          attachBallToPlayer(state.selected.id);
          renderCreate();
        }
        if (action === 'detach-ball' && currentStep().entities.ball) {
          checkpoint();
          currentStep().entities.ball.ownerId = null;
          recomputeFollowingStepsFrom(state.currentStepIndex);
          renderCreate();
        }
      });
    });
    panel.classList.remove('hidden');
  }

  function renderCourt(svg, step, options = {}) {
    const selected = options.selected || null;
    svg.innerHTML = '';
    drawCourtBase(svg);

    const actionLayer = el('g', { class: 'actions-layer' });
    step.actions.forEach((action) => drawAction(actionLayer, action, selected?.kind === 'action' && selected.id === action.id, options.interactive));
    if (options.draftAction) drawAction(actionLayer, { ...options.draftAction, ghost: true }, false, false);
    svg.appendChild(actionLayer);

    if (options.showHandles && selected?.kind === 'action') {
      const action = findAction(step, selected.id);
      if (action) drawActionHandles(svg, action);
    }

    const entityLayer = el('g', { class: 'entities-layer' });
    step.entities.players.forEach((player) => drawPlayer(entityLayer, player, selected?.kind === 'player' && selected.id === player.id, options.interactive));
    if (step.entities.ball) drawBall(entityLayer, resolvedBall(step.entities), selected?.kind === 'ball', options.interactive);
    svg.appendChild(entityLayer);
  }

  function drawCourtBase(svg) {
    const defs = el('defs');
    defs.appendChild(marker('arrowMove', '#22c55e'));
    defs.appendChild(marker('arrowPass', '#f8c14f'));
    defs.appendChild(marker('arrowDribble', '#60a5fa'));
    defs.appendChild(filterSoftShadow());
    svg.appendChild(defs);

    svg.appendChild(el('rect', { x: 0, y: 0, width: 600, height: 900, rx: 28, class: 'court-bg' }));
    svg.appendChild(el('rect', { x: 18, y: 18, width: 564, height: 864, rx: 18, class: 'court-line' }));
    svg.appendChild(el('line', { x1: 18, y1: 450, x2: 582, y2: 450, class: 'court-line thin' }));
    svg.appendChild(el('circle', { cx: 300, cy: 450, r: 72, class: 'court-line thin' }));
    svg.appendChild(el('circle', { cx: 300, cy: 450, r: 8, fill: 'rgba(49,71,96,0.55)' }));

    drawHalfCourt(svg, 'top');
    drawHalfCourt(svg, 'bottom');
  }

  function drawHalfCourt(svg, side) {
    const top = side === 'top';
    const hoopY = top ? 84 : 816;
    const laneY = top ? 18 : 642;
    const arcY = top ? 84 : 816;
    const freeThrowY = top ? 210 : 690;

    svg.appendChild(el('line', { x1: 250, y1: hoopY, x2: 350, y2: hoopY, class: 'court-line' }));
    svg.appendChild(el('circle', { cx: 300, cy: top ? 100 : 800, r: 14, class: 'court-line' }));
    svg.appendChild(el('rect', { x: 210, y: laneY, width: 180, height: 240, class: 'court-line' }));
    svg.appendChild(el('circle', { cx: 300, cy: freeThrowY, r: 60, class: 'court-line thin' }));

    const arcPath = top
      ? `M 90 18 A 250 250 0 0 0 510 18`
      : `M 90 882 A 250 250 0 0 1 510 882`;
    svg.appendChild(el('path', { d: arcPath, class: 'court-line thin' }));

    const restricted = top
      ? `M 252 ${arcY + 16} A 48 48 0 0 0 348 ${arcY + 16}`
      : `M 252 ${arcY - 16} A 48 48 0 0 1 348 ${arcY - 16}`;
    svg.appendChild(el('path', { d: restricted, class: 'court-line thin' }));
  }

  function marker(id, color) {
    const markerEl = el('marker', {
      id,
      viewBox: '0 0 12 12',
      refX: 10,
      refY: 6,
      markerWidth: 7,
      markerHeight: 7,
      orient: 'auto-start-reverse'
    });
    markerEl.appendChild(el('path', { d: 'M 1 1 L 11 6 L 1 11 Z', fill: color }));
    return markerEl;
  }

  function filterSoftShadow() {
    const filter = el('filter', { id: 'softShadow', x: '-30%', y: '-30%', width: '160%', height: '160%' });
    filter.appendChild(el('feDropShadow', { dx: 0, dy: 5, stdDeviation: 4, 'flood-opacity': 0.25 }));
    return filter;
  }

  function drawAction(parent, action, isSelected, interactive) {
    const path = el('path', {
      d: action.type === 'dribble' ? wavyPath(action.from, action.to) : `M ${action.from.x} ${action.from.y} L ${action.to.x} ${action.to.y}`,
      class: `action-path ${ACTION_CLASS[action.type]} ${isSelected ? 'selected' : ''} ${action.ghost ? 'ghost-path' : ''}`,
      'data-action-id': interactive ? action.id : null,
      'marker-end': action.type === 'move' ? 'url(#arrowMove)' : action.type === 'pass' ? 'url(#arrowPass)' : action.type === 'dribble' ? 'url(#arrowDribble)' : null
    });
    parent.appendChild(path);

    if (action.type === 'screen') {
      const bar = screenBar(action.from, action.to);
      parent.appendChild(el('line', {
        x1: bar.x1,
        y1: bar.y1,
        x2: bar.x2,
        y2: bar.y2,
        class: `action-path action-screen ${isSelected ? 'selected' : ''}`,
        'data-action-id': interactive ? action.id : null
      }));
    }
  }

  function drawActionHandles(svg, action) {
    svg.appendChild(el('circle', {
      cx: action.to.x,
      cy: action.to.y,
      r: 12,
      class: 'edit-handle',
      'data-handle-action-id': action.id,
      'data-handle-kind': 'to'
    }));
  }

  function drawPlayer(parent, player, selected, interactive) {
    const group = el('g', {
      class: `player-node player-${player.side} ${selected ? 'selected' : ''}`,
      transform: `translate(${player.x} ${player.y})`,
      'data-entity-kind': interactive ? 'player' : null,
      'data-entity-id': interactive ? player.id : null
    });
    group.appendChild(el('circle', { class: 'outer', r: COURT.playerRadius, cx: 0, cy: 0, filter: 'url(#softShadow)' }));
    group.appendChild(el('circle', { r: 16, cx: 0, cy: 0, fill: 'rgba(255,255,255,0.14)' }));
    group.appendChild(el('text', { class: 'player-number', x: 0, y: 1 }, String(player.number)));
    parent.appendChild(group);
  }

  function drawBall(parent, ball, selected, interactive) {
    const group = el('g', {
      class: `ball-node ${selected ? 'selected' : ''}`,
      transform: `translate(${ball.x} ${ball.y})`,
      'data-entity-kind': interactive ? 'ball' : null,
      'data-entity-id': interactive ? 'ball' : null
    });
    group.appendChild(el('circle', { class: 'ball-main', r: COURT.ballRadius, fill: '#e97724', stroke: '#8b3614', 'stroke-width': 2 }));
    group.appendChild(el('path', { d: `M ${-COURT.ballRadius} 0 H ${COURT.ballRadius} M 0 ${-COURT.ballRadius} V ${COURT.ballRadius}`, stroke: '#8b3614', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    group.appendChild(el('path', { d: `M -7 -11 C -1 -4 -1 4 -7 11 M 7 -11 C 1 -4 1 4 7 11`, stroke: '#8b3614', 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round' }));
    parent.appendChild(group);
  }

  function renderLibrary() {
    if (!els.playList) return;
    if (state.plays.length === 0) {
      els.playList.innerHTML = `<div class="empty-state"><strong>No saved plays yet</strong>Create a play, then tap Save. Your local playbook will appear here.</div>`;
      return;
    }

    els.playList.innerHTML = state.plays.map((play) => {
      const stepCount = play.steps?.length || 0;
      const updated = play.updatedAt ? new Date(play.updatedAt).toLocaleString() : 'Not saved yet';
      return `
        <article class="play-card" data-play-id="${play.id}">
          <div class="play-card-top">
            <div>
              <h3>${escapeHtml(play.name || 'Untitled Play')}</h3>
              <div class="play-card-meta">${stepCount} step${stepCount === 1 ? '' : 's'} • Updated ${escapeHtml(updated)}</div>
            </div>
            <div class="step-chip">${stepCount}</div>
          </div>
          <div class="play-card-actions">
            <button class="pill-button primary" data-library-action="open">Open</button>
            <button class="pill-button secondary" data-library-action="review">Review</button>
            <button class="pill-button secondary" data-library-action="duplicate">Duplicate</button>
            <button class="pill-button secondary" data-library-action="export">Export</button>
            <button class="pill-button danger" data-library-action="delete">Delete</button>
          </div>
        </article>`;
    }).join('');

    els.playList.querySelectorAll('[data-library-action]').forEach((button) => {
      button.addEventListener('click', () => handleLibraryAction(button.closest('[data-play-id]').dataset.playId, button.dataset.libraryAction));
    });
  }

  function handleLibraryAction(playId, action) {
    const play = state.plays.find((item) => item.id === playId);
    if (!play) return;
    if (action === 'open') {
      state.currentPlay = clone(play);
      state.currentStepIndex = 0;
      state.selected = null;
      saveCurrentPlayId();
      setScreen('create');
      renderAll();
    }
    if (action === 'review') {
      state.currentPlay = clone(play);
      state.currentStepIndex = 0;
      state.review.index = 0;
      state.review.progress = 0;
      saveCurrentPlayId();
      setScreen('review');
      renderAll();
    }
    if (action === 'duplicate') {
      const copy = clone(play);
      copy.id = uid('play');
      copy.name = `${copy.name || 'Untitled Play'} Copy`;
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      state.plays.unshift(copy);
      persistLocalPlays();
      renderLibrary();
    }
    if (action === 'export') exportJson(play, slugify(play.name) + '.json');
    if (action === 'delete') {
      if (!confirm(`Delete "${play.name || 'Untitled Play'}" from this device?`)) return;
      state.plays = state.plays.filter((item) => item.id !== playId);
      persistLocalPlays();
      if (state.currentPlay.id === playId) {
        state.currentPlay = state.plays[0] ? clone(state.plays[0]) : createNewPlay();
        saveCurrentPlayId();
      }
      renderAll();
    }
  }

  function renderReview() {
    if (!state.currentPlay) return;
    const maxIndex = Math.max(0, state.currentPlay.steps.length - 1);
    state.review.index = Math.max(0, Math.min(state.review.index, maxIndex));
    els.reviewTitle.textContent = state.currentPlay.name || 'Untitled Play';
    els.reviewStepChip.textContent = `Step ${state.review.index + 1} of ${state.currentPlay.steps.length}`;
    els.playPauseBtn.textContent = state.review.playing ? 'Ⅱ' : '▶';
    const step = state.currentPlay.steps[state.review.index];
    const frame = frameStep(step, state.review.progress);
    renderCourt(els.reviewSvg, frame, { interactive: false, showHandles: false });
  }

  function frameStep(step, t) {
    const frame = clone(step);
    const entities = clone(step.entities);
    step.actions.forEach((action) => {
      if (['move', 'screen'].includes(action.type)) {
        const player = entities.players.find((item) => item.id === action.actorId);
        if (player) {
          player.x = lerp(action.from.x, action.to.x, easeInOut(t));
          player.y = lerp(action.from.y, action.to.y, easeInOut(t));
        }
      }
      if (action.type === 'dribble') {
        const player = entities.players.find((item) => item.id === action.actorId);
        if (player) {
          player.x = lerp(action.from.x, action.to.x, easeInOut(t));
          player.y = lerp(action.from.y, action.to.y, easeInOut(t));
          entities.ball = { ...playerBallPosition(player), ownerId: player.id };
        }
      }
      if (action.type === 'pass') {
        const start = action.actorId === 'ball' ? resolvedBall(step.entities) : playerBallPosition(findPlayer(step, action.actorId) || action.from);
        entities.ball = {
          x: lerp(start.x, action.to.x, easeOut(t)),
          y: lerp(start.y, action.to.y, easeOut(t)),
          ownerId: t >= 1 ? action.targetPlayerId || null : null
        };
      }
    });
    if (t >= 1) frame.entities = deriveEndEntities(step);
    else frame.entities = entities;
    return frame;
  }

  function togglePlayback() {
    state.review.playing = !state.review.playing;
    state.review.lastTs = performance.now();
    if (state.review.playing) state.review.raf = requestAnimationFrame(playbackTick);
    renderReview();
  }

  function playbackTick(ts) {
    if (!state.review.playing) return;
    const delta = ts - state.review.lastTs;
    state.review.lastTs = ts;
    const duration = 1650 / state.review.speed;
    state.review.progress += delta / duration;
    if (state.review.progress >= 1) {
      state.review.progress = 0;
      if (state.review.index < state.currentPlay.steps.length - 1) state.review.index += 1;
      else state.review.playing = false;
    }
    renderReview();
    if (state.review.playing) state.review.raf = requestAnimationFrame(playbackTick);
  }

  function jumpReviewStep(index) {
    state.review.index = Math.max(0, Math.min(state.currentPlay.steps.length - 1, index));
    state.review.progress = 0;
    state.review.playing = false;
    renderReview();
  }

  function restartPlayback() {
    state.review.index = 0;
    state.review.progress = 0;
    state.review.playing = false;
    renderReview();
  }

  function checkpoint() {
    state.undoStack.push(clone({ play: state.currentPlay, stepIndex: state.currentStepIndex, selected: state.selected }));
    if (state.undoStack.length > 75) state.undoStack.shift();
    state.redoStack = [];
  }

  function undo() {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(clone({ play: state.currentPlay, stepIndex: state.currentStepIndex, selected: state.selected }));
    const snapshot = state.undoStack.pop();
    state.currentPlay = snapshot.play;
    state.currentStepIndex = snapshot.stepIndex;
    state.selected = snapshot.selected;
    renderAll();
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(clone({ play: state.currentPlay, stepIndex: state.currentStepIndex, selected: state.selected }));
    const snapshot = state.redoStack.pop();
    state.currentPlay = snapshot.play;
    state.currentStepIndex = snapshot.stepIndex;
    state.selected = snapshot.selected;
    renderAll();
  }

  function getActorPosition(step, actorId) {
    if (actorId === 'ball') return step.entities.ball ? resolvedBall(step.entities) : null;
    const player = findPlayer(step, actorId);
    return player ? { x: player.x, y: player.y } : null;
  }

  function findPlayer(step, id) {
    if (!step || !id) return null;
    return step.entities.players.find((player) => player.id === id) || null;
  }

  function findAction(step, id) {
    return step.actions.find((action) => action.id === id) || null;
  }

  function findNearestPlayer(step, point, maxDistance = Infinity) {
    let best = null;
    let bestDistance = maxDistance;
    step.entities.players.forEach((player) => {
      const d = distance(player, point);
      if (d < bestDistance) {
        best = player;
        bestDistance = d;
      }
    });
    return best;
  }

  function resolvedBall(entities) {
    if (!entities.ball) return null;
    if (entities.ball.ownerId) {
      const owner = entities.players.find((player) => player.id === entities.ball.ownerId);
      if (owner) return { ...playerBallPosition(owner), ownerId: owner.id };
    }
    return entities.ball;
  }

  function playerBallPosition(player) {
    return { x: Math.min(COURT.width - 18, player.x + 22), y: Math.min(COURT.height - 18, player.y + 19) };
  }

  function wavyPath(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const segments = Math.max(8, Math.round(len / 22));
    let d = `M ${from.x} ${from.y}`;
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const amp = Math.sin(t * Math.PI * segments) * 11;
      const x = from.x + dx * t + nx * amp;
      const y = from.y + dy * t + ny * amp;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }

  function screenBar(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const half = 20;
    return {
      x1: to.x - nx * half,
      y1: to.y - ny * half,
      x2: to.x + nx * half,
      y2: to.y + ny * half
    };
  }

  function exportJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importJsonFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      importPlayData(data);
      showToast('Imported');
    } catch (error) {
      showToast('Import failed');
      console.error(error);
    }
  }

  function importPlayData(data) {
    checkpoint();
    const incoming = Array.isArray(data.plays) ? data.plays : data.steps ? [data] : [];
    if (incoming.length === 0) throw new Error('No plays found in JSON');
    incoming.forEach((play) => {
      normalizePlay(play);
      if (!play.id) play.id = uid('play');
      const existing = state.plays.findIndex((item) => item.id === play.id);
      if (existing >= 0) state.plays[existing] = clone(play);
      else state.plays.unshift(clone(play));
    });
    state.currentPlay = clone(incoming[0]);
    state.currentStepIndex = 0;
    persistLocalPlays();
    saveCurrentPlayId();
    renderAll();
  }

  function getGitHubSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.github) || '{}');
    } catch {
      return {};
    }
  }

  function loadGitHubSettingsIntoForm() {
    const settings = getGitHubSettings();
    els.ghOwner.value = settings.owner || '';
    els.ghRepo.value = settings.repo || '';
    els.ghBranch.value = settings.branch || 'main';
    els.ghPath.value = settings.path || 'data/playbook-live.json';
    els.ghToken.value = settings.token || '';
  }

  function saveGitHubSettingsFromForm() {
    const settings = {
      owner: els.ghOwner.value.trim(),
      repo: els.ghRepo.value.trim(),
      branch: els.ghBranch.value.trim() || 'main',
      path: els.ghPath.value.trim() || 'data/playbook-live.json',
      token: els.ghToken.value.trim()
    };
    localStorage.setItem(STORAGE.github, JSON.stringify(settings));
    els.settingsDialog.close();
    showToast('GitHub settings saved');
  }

  function clearGitHubSettings() {
    localStorage.removeItem(STORAGE.github);
    loadGitHubSettingsIntoForm();
    showToast('GitHub settings cleared');
  }

  function requireGitHubSettings() {
    const settings = getGitHubSettings();
    if (!settings.owner || !settings.repo || !settings.branch || !settings.path || !settings.token) {
      els.settingsDialog.showModal();
      showToast('Add GitHub settings first');
      return null;
    }
    return settings;
  }

  async function savePlaybookToGitHub() {
    const settings = requireGitHubSettings();
    if (!settings) return;
    saveCurrentPlayToLibrary();
    const body = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: 'Playbook Live',
      plays: state.plays
    };
    const content = JSON.stringify(body, null, 2);
    const getUrl = githubContentsUrl(settings, true);
    const putUrl = githubContentsUrl(settings, false);
    try {
      let sha = null;
      const existing = await fetch(getUrl, { headers: githubHeaders(settings) });
      if (existing.ok) {
        const json = await existing.json();
        sha = json.sha;
      }
      const response = await fetch(putUrl, {
        method: 'PUT',
        headers: githubHeaders(settings),
        body: JSON.stringify({
          message: `Save Playbook Live plays (${new Date().toLocaleString()})`,
          content: utf8ToBase64(content),
          branch: settings.branch,
          sha
        })
      });
      if (!response.ok) throw new Error(await response.text());
      showToast('Saved to GitHub');
    } catch (error) {
      console.error(error);
      showToast('GitHub save failed');
    }
  }

  async function loadPlaybookFromGitHub() {
    const settings = requireGitHubSettings();
    if (!settings) return;
    try {
      const response = await fetch(githubContentsUrl(settings, true), { headers: githubHeaders(settings) });
      if (!response.ok) throw new Error(await response.text());
      const json = await response.json();
      const content = base64ToUtf8(json.content || '');
      const data = JSON.parse(content);
      if (!Array.isArray(data.plays)) throw new Error('GitHub file does not contain plays array');
      if (state.plays.length > 0 && !confirm('Replace the local playbook with the GitHub playbook?')) return;
      state.plays = data.plays;
      state.plays.forEach(normalizePlay);
      persistLocalPlays();
      state.currentPlay = state.plays[0] ? clone(state.plays[0]) : createNewPlay();
      state.currentStepIndex = 0;
      saveCurrentPlayId();
      renderAll();
      showToast('Loaded from GitHub');
    } catch (error) {
      console.error(error);
      showToast('GitHub load failed');
    }
  }

  function githubContentsUrl(settings, includeRef = false) {
    const base = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${settings.path.split('/').map(encodeURIComponent).join('/')}`;
    return includeRef ? `${base}?ref=${encodeURIComponent(settings.branch)}` : base;
  }

  function githubHeaders(settings) {
    return {
      Authorization: `Bearer ${settings.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function base64ToUtf8(str) {
    const binary = atob(str.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function el(name, attrs = {}, text = null) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    });
    if (text !== null) node.textContent = text;
    return node;
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function slugify(str) {
    return (str || 'play').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'play';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  let toastTimer = null;
  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 1900);
  }
})();
