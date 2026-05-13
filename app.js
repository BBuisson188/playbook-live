(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COURT_CONFIGS = {
    full: { width: 565, height: 800, image: 'assets/full-court.png' },
    half: { width: 659, height: 591, image: 'assets/half-court.png' },
    placeholder: { width: 600, height: 900, image: null }
  };
  const MARKERS = { playerRadius: 24, ballRadius: 13 };
  const APP_MODE = document.body?.dataset.appMode === 'player' ? 'player' : 'coach';
  const COACH_PASSCODE = "coach";
  const COACH_UNLOCK_KEY = 'playbook-live:coach-unlocked';
  const PLAYER_JSON_URL = 'data/playbook-live.json';
  const PLAYER_CACHE_KEY = 'playbook-live:player-json-cache';
  const PLAYER_LINK = 'https://bbuisson188.github.io/playbook-live/player.html';
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
    screen: APP_MODE === 'player' ? 'playbook' : 'create',
    plays: [],
    currentPlay: null,
    currentStepIndex: 0,
    selected: null,
    drag: null,
    draftAction: null,
    lastHandleTap: null,
    playReorder: null,
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
    if (APP_MODE === 'player') {
      initPlayer();
      return;
    }
    initCoachGate();
  }

  function initCoachGate() {
    cacheElements();
    if (localStorage.getItem(COACH_UNLOCK_KEY) === 'true') {
      unlockCoachApp();
      return;
    }
    document.body.classList.add('coach-locked');
    els.coachGate?.classList.remove('hidden');
    els.coachPasscode?.focus();
    els.coachUnlockBtn?.addEventListener('click', handleCoachUnlock);
    els.coachPasscode?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleCoachUnlock();
      }
    });
  }

  function handleCoachUnlock() {
    if (els.coachPasscode?.value === COACH_PASSCODE) {
      localStorage.setItem(COACH_UNLOCK_KEY, 'true');
      unlockCoachApp();
      return;
    }
    if (els.coachGateMessage) els.coachGateMessage.textContent = 'That passcode did not unlock coach mode.';
    els.coachPasscode?.select();
  }

  function unlockCoachApp() {
    els.coachGate?.classList.add('hidden');
    document.body.classList.remove('coach-locked');
    initCoachApp();
  }

  function initCoachApp() {
    cacheElements();
    loadLocalPlays();
    loadOrCreateCurrentPlay();
    loadGitHubSettingsIntoForm();
    attachEvents();
    attachViewportEvents();
    renderAll();
    registerServiceWorker();
  }

  async function initPlayer() {
    cacheElements();
    attachPlayerEvents();
    attachViewportEvents();
    await loadPlayerPlaybook();
    registerServiceWorker();
  }

  function cacheElements() {
    Object.assign(els, {
      courtSvg: document.getElementById('courtSvg'),
      reviewSvg: document.getElementById('reviewSvg'),
      playName: document.getElementById('playName'),
      stepChip: document.getElementById('stepChip'),
      courtChooser: document.getElementById('courtChooser'),
      toast: document.getElementById('toast'),
      undoBtn: document.getElementById('undoBtn'),
      redoBtn: document.getElementById('redoBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      prevStepBtn: document.getElementById('prevStepBtn'),
      nextStepBtn: document.getElementById('nextStepBtn'),
      addBlankStepBtn: document.getElementById('addBlankStepBtn'),
      savePlayBtn: document.getElementById('savePlayBtn'),
      newPlayBtn: document.getElementById('newPlayBtn'),
      saveGitHubBtn: document.getElementById('saveGitHubBtn'),
      loadGitHubBtn: document.getElementById('loadGitHubBtn'),
      exportPlaybookBtn: document.getElementById('exportPlaybookBtn'),
      importPlaybookBtn: document.getElementById('importPlaybookBtn'),
      importPlaybookInput: document.getElementById('importPlaybookInput'),
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
      speedSlider: document.getElementById('speedSlider'),
      fullscreenBtn: document.getElementById('fullscreenBtn'),
      syncResultDialog: document.getElementById('syncResultDialog'),
      syncResultKicker: document.getElementById('syncResultKicker'),
      syncResultTitle: document.getElementById('syncResultTitle'),
      syncResultMessage: document.getElementById('syncResultMessage'),
      syncResultDetails: document.getElementById('syncResultDetails'),
      coachGate: document.getElementById('coachGate'),
      coachPasscode: document.getElementById('coachPasscode'),
      coachUnlockBtn: document.getElementById('coachUnlockBtn'),
      coachGateMessage: document.getElementById('coachGateMessage'),
      lockCoachBtn: document.getElementById('lockCoachBtn'),
      copyPlayerLinkBtn: document.getElementById('copyPlayerLinkBtn'),
      playerCoachAccessBtn: document.getElementById('playerCoachAccessBtn'),
      playerCoachDialog: document.getElementById('playerCoachDialog'),
      playerCoachPasscode: document.getElementById('playerCoachPasscode'),
      playerCoachUnlockBtn: document.getElementById('playerCoachUnlockBtn'),
      playerCoachMessage: document.getElementById('playerCoachMessage'),
      playerStatus: document.getElementById('playerStatus'),
      retryPlayerLoadBtn: document.getElementById('retryPlayerLoadBtn')
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
    els.savePlayBtn.addEventListener('click', () => {
      saveCurrentPlayToLibrary();
      showToast('Play saved');
    });

    els.newPlayBtn.addEventListener('click', () => {
      checkpoint();
      state.currentPlay = createNewPlay();
      state.currentStepIndex = 0;
      state.selected = null;
      saveCurrentPlayId();
      setScreen('create');
      renderAll();
    });

    document.querySelectorAll('[data-court-type]').forEach((button) => {
      button.addEventListener('click', () => setCourtType(button.dataset.courtType));
    });
    els.saveGitHubBtn.addEventListener('click', savePlaybookToGitHub);
    els.loadGitHubBtn.addEventListener('click', loadPlaybookFromGitHub);
    els.exportPlaybookBtn.addEventListener('click', exportPlaybookJson);
    els.importPlaybookBtn?.addEventListener('click', () => els.importPlaybookInput?.click());
    els.importPlaybookInput?.addEventListener('change', importJsonFile);
    els.copyPlayerLinkBtn?.addEventListener('click', copyPlayerLink);

    els.saveSettingsBtn.addEventListener('click', saveGitHubSettingsFromForm);
    els.clearGitHubBtn.addEventListener('click', clearGitHubSettings);
    els.lockCoachBtn?.addEventListener('click', lockCoachMode);

    els.reviewBackBtn.addEventListener('click', () => jumpReviewStep(state.review.index - 1));
    els.reviewForwardBtn.addEventListener('click', () => jumpReviewStep(state.review.index + 1));
    els.playPauseBtn.addEventListener('click', togglePlayback);
    els.restartBtn.addEventListener('click', restartPlayback);
    els.fullscreenBtn.addEventListener('click', toggleReviewFullscreen);
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

  function attachPlayerEvents() {
    document.querySelectorAll('.nav-button').forEach((button) => {
      button.addEventListener('click', () => setScreen(button.dataset.screen));
    });

    els.reviewBackBtn?.addEventListener('click', () => jumpReviewStep(state.review.index - 1));
    els.reviewForwardBtn?.addEventListener('click', () => jumpReviewStep(state.review.index + 1));
    els.playPauseBtn?.addEventListener('click', togglePlayback);
    els.restartBtn?.addEventListener('click', restartPlayback);
    els.fullscreenBtn?.addEventListener('click', toggleReviewFullscreen);
    els.speedSlider?.addEventListener('input', () => {
      state.review.speed = Number(els.speedSlider.value);
    });
    els.retryPlayerLoadBtn?.addEventListener('click', loadPlayerPlaybook);
    els.playerCoachAccessBtn?.addEventListener('click', openPlayerCoachAccess);
    els.playerCoachUnlockBtn?.addEventListener('click', handlePlayerCoachUnlock);
    els.playerCoachPasscode?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handlePlayerCoachUnlock();
      }
    });
  }

  function openPlayerCoachAccess() {
    if (localStorage.getItem(COACH_UNLOCK_KEY) === 'true') {
      window.location.href = 'coach.html';
      return;
    }
    if (els.playerCoachMessage) els.playerCoachMessage.textContent = '';
    if (els.playerCoachPasscode) els.playerCoachPasscode.value = '';
    els.playerCoachDialog?.showModal();
    els.playerCoachPasscode?.focus();
  }

  function handlePlayerCoachUnlock() {
    if (els.playerCoachPasscode?.value === COACH_PASSCODE) {
      localStorage.setItem(COACH_UNLOCK_KEY, 'true');
      window.location.href = 'coach.html';
      return;
    }
    if (els.playerCoachMessage) els.playerCoachMessage.textContent = 'That passcode did not unlock coach mode.';
    els.playerCoachPasscode?.select();
  }

  function attachViewportEvents() {
    window.addEventListener('resize', renderAll);
    window.addEventListener('orientationchange', renderAll);
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        document.getElementById('reviewScreen')?.classList.remove('ios-fullscreen');
        document.body.classList.remove('review-fullscreen-active');
        els.fullscreenBtn?.setAttribute('aria-label', 'Full screen');
        renderReview();
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
      courtType: null,
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
      state.plays.forEach(normalizePlay);
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
    normalizePlay(state.currentPlay);
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
    if (!Object.prototype.hasOwnProperty.call(play, 'courtType')) play.courtType = 'full';
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
    if (APP_MODE === 'player' && !['playbook', 'review'].includes(screen)) return;
    state.screen = screen;
    document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.screen === screen));
    document.querySelectorAll('.screen').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`${screen}Screen`)?.classList.add('active');
    if (screen === 'playbook') renderLibrary();
    if (screen === 'review') {
      if (state.currentPlay) state.review.index = Math.min(state.review.index, state.currentPlay.steps.length - 1);
      renderReview();
    }
  }

  function setCourtType(type) {
    if (!['half', 'full'].includes(type)) return;
    checkpoint();
    state.currentPlay.courtType = type;
    state.currentPlay.updatedAt = new Date().toISOString();
    renderAll();
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
    const court = getCourtConfig(state.currentPlay.courtType);
    return {
      x: Math.max(26, Math.min(court.width - 26, point.x)),
      y: Math.max(26, Math.min(court.height - 26, point.y))
    };
  }

  function onCourtPointerDown(event) {
    if (!state.currentPlay.courtType) return;
    const pointer = getPointerPosition(els.courtSvg, event);
    const target = event.target.closest('[data-entity-kind], [data-action-id], [data-handle-action-id]');
    els.courtSvg.setPointerCapture(event.pointerId);

    if (target?.dataset.handleActionId) {
      const action = findAction(currentStep(), target.dataset.handleActionId);
      const handleKind = target.dataset.handleKind || 'to';
      const now = Date.now();
      const isDoubleTap = state.lastHandleTap?.id === target.dataset.handleActionId && now - state.lastHandleTap.ts < 360;
      state.lastHandleTap = { id: target.dataset.handleActionId, ts: now };
      if (handleKind === 'to' && action && canContinueAction(action) && (event.detail >= 2 || isDoubleTap)) {
        beginDraftAction(action.type, action.actorId, pointer, action.to);
        return;
      }
      checkpoint();
      state.selected = { kind: 'action', id: target.dataset.handleActionId };
      state.drag = { mode: 'handle', actionId: target.dataset.handleActionId, handle: handleKind };
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
        refreshActionStarts(currentStep());
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
      if (state.drag.handle === 'curve') {
        action.control = pointer;
      } else {
        action.to = pointer;
        if (['move', 'screen', 'dribble'].includes(action.type)) action.control = null;
      }
      if (action.type === 'pass' && state.drag.handle !== 'curve') {
        const target = findNearestPlayer(currentStep(), pointer, 38);
        action.targetPlayerId = target?.id || null;
        if (target) action.to = playerBallPosition(target);
      }
      refreshActionStarts(currentStep());
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

  function beginDraftAction(type, actorId, pointer, forcedFrom = null) {
    const step = currentStep();
    const actorPos = forcedFrom || getDraftActionStart(step, actorId, type);
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
    refreshActionStarts(currentStep());
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
    const actorPositions = new Map(step.entities.players.map((player) => [player.id, { x: player.x, y: player.y }]));
    step.actions.forEach((action) => {
      const pos = action.actorId === 'ball' ? getActorPosition(step, action.actorId) : actorPositions.get(action.actorId);
      if (pos) action.from = { x: pos.x, y: pos.y };
      if (action.type === 'pass' && action.targetPlayerId) {
        const target = findPlayer(step, action.targetPlayerId);
        if (target) action.to = playerBallPosition(target);
      }
      if (['move', 'dribble', 'screen'].includes(action.type) && action.actorId !== 'ball') {
        actorPositions.set(action.actorId, { x: action.to.x, y: action.to.y });
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
    if (APP_MODE === 'player') {
      renderLibrary();
      renderReview();
      return;
    }
    renderCreate();
    renderLibrary();
    renderReview();
  }

  function renderCreate(skipPanel = false) {
    if (APP_MODE === 'player') return;
    els.playName.value = state.currentPlay.name || 'Untitled Play';
    els.stepChip.textContent = `Step ${state.currentStepIndex + 1} of ${state.currentPlay.steps.length}`;
    els.prevStepBtn.disabled = state.currentStepIndex === 0;
    els.nextStepBtn.textContent = state.currentStepIndex === state.currentPlay.steps.length - 1 ? 'Next Step' : 'Next Step \u203a';
    els.undoBtn.disabled = state.undoStack.length === 0;
    els.redoBtn.disabled = state.redoStack.length === 0;
    els.courtChooser.classList.toggle('hidden', Boolean(state.currentPlay.courtType));
    renderCourt(els.courtSvg, currentStep(), {
      courtType: state.currentPlay.courtType,
      selected: state.selected,
      draftAction: state.draftAction,
      interactive: true,
      showHandles: true
    });
  }

  function renderCourt(svg, step, options = {}) {
    const selected = options.selected || null;
    const court = getCourtConfig(options.courtType);
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${court.width} ${court.height}`);
    svg.style.setProperty('--court-aspect', `${court.width} / ${court.height}`);
    fitCourtSvg(svg, court);
    drawCourtBase(svg, options.courtType);

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

  function drawCourtBase(svg, courtType = 'full') {
    const court = getCourtConfig(courtType);
    const defs = el('defs');
    defs.appendChild(marker('arrowMove', '#22c55e'));
    defs.appendChild(marker('arrowPass', '#f8c14f'));
    defs.appendChild(marker('arrowDribble', '#60a5fa'));
    svg.appendChild(defs);

    if (!courtType) {
      svg.appendChild(el('rect', { x: 0, y: 0, width: court.width, height: court.height, rx: 28, class: 'court-placeholder-bg' }));
      return;
    }

    svg.appendChild(el('rect', { x: 0, y: 0, width: court.width, height: court.height, rx: 28, class: 'court-placeholder-bg' }));
    svg.appendChild(el('image', {
      href: court.image,
      x: 0,
      y: 0,
      width: court.width,
      height: court.height,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'court-image'
    }));
  }

  function getCourtConfig(courtType) {
    return COURT_CONFIGS[courtType] || COURT_CONFIGS.placeholder;
  }

  function fitCourtSvg(svg, court) {
    const viewport = svg.parentElement;
    if (!viewport) return;
    const availableWidth = viewport.clientWidth;
    const availableHeight = viewport.clientHeight;
    if (!availableWidth || !availableHeight) return;
    const courtRatio = court.width / court.height;
    const viewportRatio = availableWidth / availableHeight;
    if (viewportRatio > courtRatio) {
      svg.style.height = `${availableHeight}px`;
      svg.style.width = `${availableHeight * courtRatio}px`;
    } else {
      svg.style.width = `${availableWidth}px`;
      svg.style.height = `${availableWidth / courtRatio}px`;
    }
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

  function drawAction(parent, action, isSelected, interactive) {
    const actionPath = actionPathD(action);
    const path = el('path', {
      d: actionPath,
      class: `action-path ${ACTION_CLASS[action.type]} ${isSelected ? 'selected' : ''} ${action.ghost ? 'ghost-path' : ''}`,
      'data-action-id': interactive ? action.id : null,
      'marker-end': action.type === 'move' ? 'url(#arrowMove)' : action.type === 'pass' ? 'url(#arrowPass)' : action.type === 'dribble' ? 'url(#arrowDribble)' : null
    });
    parent.appendChild(path);

    if (action.type === 'screen') {
      const bar = screenBar(action.control || action.from, action.to);
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
    if (canCurveAction(action)) {
      const mid = action.control || midpoint(action.from, action.to);
      svg.appendChild(el('circle', {
        cx: mid.x,
        cy: mid.y,
        r: 11,
        class: 'curve-handle',
        'data-handle-action-id': action.id,
        'data-handle-kind': 'curve'
      }));
    }
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
    group.appendChild(el('circle', {
      class: 'outer',
      r: MARKERS.playerRadius,
      cx: 0,
      cy: 0,
      fill: player.side === 'offense' ? '#1b7cff' : '#f0445a',
      style: `fill: ${player.side === 'offense' ? '#1b7cff' : '#f0445a'}`
    }));
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
    group.appendChild(el('circle', { class: 'ball-main', r: MARKERS.ballRadius, fill: '#e97724', stroke: '#8b3614', 'stroke-width': 2 }));
    group.appendChild(el('path', { d: `M ${-MARKERS.ballRadius} 0 H ${MARKERS.ballRadius} M 0 ${-MARKERS.ballRadius} V ${MARKERS.ballRadius}`, stroke: '#8b3614', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    group.appendChild(el('path', { d: `M -7 -11 C -1 -4 -1 4 -7 11 M 7 -11 C 1 -4 1 4 7 11`, stroke: '#8b3614', 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round' }));
    parent.appendChild(group);
  }

  function renderLibrary() {
    if (!els.playList) return;
    if (state.plays.length === 0) {
      els.playList.innerHTML = APP_MODE === 'player'
        ? `<div class="empty-state"><strong>No published plays yet</strong>The player playbook loaded, but it does not contain any plays.</div>`
        : `<div class="empty-state"><strong>No saved plays yet</strong>Create a play, then tap Save. Your local playbook will appear here.</div>`;
      return;
    }

    els.playList.innerHTML = state.plays.map((play) => {
      const stepCount = play.steps?.length || 0;
      const updated = play.updatedAt ? new Date(play.updatedAt).toLocaleString() : 'Not saved yet';
      const isDragging = state.playReorder?.playId === play.id;
      const isSelected = state.currentPlay?.id === play.id;
      const playerActions = `
            <button class="pill-button primary" data-library-action="review">Review</button>`;
      const coachActions = `
            <button class="pill-button primary" data-library-action="open">Edit</button>
            <button class="pill-button secondary" data-library-action="review">Review</button>
            <button class="pill-button secondary" data-library-action="duplicate">Duplicate</button>
            <button class="pill-button danger" data-library-action="delete">Delete</button>`;
      return `
        <article class="play-card ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}" data-play-id="${play.id}">
          <div class="play-card-top">
            <div>
              <h3>${escapeHtml(play.name || 'Untitled Play')}</h3>
              <div class="play-card-meta">${stepCount} step${stepCount === 1 ? '' : 's'} &bull; Updated ${escapeHtml(updated)}</div>
            </div>
            <div class="play-card-side">
              <div class="step-chip">${stepCount}</div>
              ${APP_MODE === 'player' ? '' : `<button class="reorder-handle" data-reorder-play-id="${play.id}" type="button" title="Drag to reorder" aria-label="Drag to reorder play">&#8645;</button>`}
            </div>
          </div>
          <div class="play-card-actions">
            ${APP_MODE === 'player' ? playerActions : coachActions}
          </div>
        </article>`;
    }).join('');

    if (APP_MODE === 'player') {
      els.playList.querySelectorAll('[data-play-id]').forEach((card) => {
        card.addEventListener('click', (event) => {
          if (event.target.closest('button')) return;
          handleLibraryAction(card.dataset.playId, 'review');
        });
      });
    }

    els.playList.querySelectorAll('[data-library-action]').forEach((button) => {
      button.addEventListener('click', () => handleLibraryAction(button.closest('[data-play-id]').dataset.playId, button.dataset.libraryAction));
    });
    if (APP_MODE === 'player') return;

    els.playList.querySelectorAll('[data-reorder-play-id]').forEach((button) => {
      button.addEventListener('pointerdown', beginPlayReorder);
    });
  }

  function beginPlayReorder(event) {
    event.preventDefault();
    const playId = event.currentTarget.dataset.reorderPlayId;
    const startIndex = state.plays.findIndex((play) => play.id === playId);
    if (startIndex < 0) return;
    state.playReorder = { playId, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', updatePlayReorder);
    window.addEventListener('pointerup', finishPlayReorder, { once: true });
    window.addEventListener('pointercancel', finishPlayReorder, { once: true });
    renderLibrary();
  }

  function updatePlayReorder(event) {
    if (!state.playReorder) return;
    const fromIndex = state.plays.findIndex((play) => play.id === state.playReorder.playId);
    if (fromIndex < 0) return;
    const cards = [...els.playList.querySelectorAll('[data-play-id]')];
    const targetIndex = cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    let toIndex = targetIndex === -1 ? state.plays.length : targetIndex;
    if (fromIndex < toIndex) toIndex -= 1;
    if (toIndex === fromIndex) return;
    const [play] = state.plays.splice(fromIndex, 1);
    state.plays.splice(toIndex, 0, play);
    renderLibrary();
  }

  function finishPlayReorder() {
    if (!state.playReorder) return;
    state.playReorder = null;
    persistLocalPlays();
    renderLibrary();
    window.removeEventListener('pointermove', updatePlayReorder);
  }

  function handleLibraryAction(playId, action) {
    const play = state.plays.find((item) => item.id === playId);
    if (!play) return;
    if (APP_MODE === 'player') {
      state.currentPlay = clone(play);
      state.currentStepIndex = 0;
      state.review.index = 0;
      state.review.progress = 0;
      state.review.playing = false;
      setScreen('review');
      renderAll();
      return;
    }
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
    if (!state.currentPlay) {
      if (els.reviewSvg) els.reviewSvg.innerHTML = '';
      [els.reviewBackBtn, els.reviewForwardBtn, els.playPauseBtn, els.restartBtn, els.fullscreenBtn].forEach((button) => {
        if (button) button.disabled = true;
      });
      return;
    }
    [els.reviewBackBtn, els.reviewForwardBtn, els.playPauseBtn, els.restartBtn, els.fullscreenBtn].forEach((button) => {
      if (button) button.disabled = false;
    });
    const maxIndex = Math.max(0, state.currentPlay.steps.length - 1);
    state.review.index = Math.max(0, Math.min(state.review.index, maxIndex));
    els.playPauseBtn.textContent = state.review.playing ? '\u23f8' : '\u25b6';
    const step = state.currentPlay.steps[state.review.index];
    const frame = frameStep(step, state.review.progress);
    renderCourt(els.reviewSvg, frame, {
      courtType: state.currentPlay.courtType || 'full',
      interactive: false,
      showHandles: false
    });
  }

  function frameStep(step, t) {
    const frame = clone(step);
    const entities = clone(step.entities);
    const playerMovement = new Map();
    step.actions.forEach((action) => {
      if (['move', 'dribble', 'screen'].includes(action.type)) {
        const items = playerMovement.get(action.actorId) || [];
        items.push(action);
        playerMovement.set(action.actorId, items);
      }
    });

    playerMovement.forEach((actions, playerId) => {
      const player = entities.players.find((item) => item.id === playerId);
      if (!player) return;
      const scaled = Math.min(0.999, t) * actions.length;
      const index = Math.min(actions.length - 1, Math.floor(scaled));
      const action = actions[index];
      const segmentT = easeInOut(scaled - index);
      const pos = action.control ? quadraticPoint(action.from, action.control, action.to, segmentT) : {
        x: lerp(action.from.x, action.to.x, segmentT),
        y: lerp(action.from.y, action.to.y, segmentT)
      };
      player.x = pos.x;
      player.y = pos.y;
      if (action.type === 'dribble') {
        entities.ball = { ...playerBallPosition(player), ownerId: player.id };
      }
    });

    step.actions.forEach((action) => {
      if (action.type === 'dribble' && !playerMovement.has(action.actorId)) {
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
    if (!state.currentPlay) return;
    if (!state.review.playing && state.review.progress >= 1) {
      if (state.review.index < state.currentPlay.steps.length - 1) {
        state.review.index += 1;
        state.review.progress = 0;
      } else {
        state.review.progress = 0;
      }
    }
    state.review.playing = !state.review.playing;
    state.review.lastTs = performance.now();
    if (state.review.playing) state.review.raf = requestAnimationFrame(playbackTick);
    renderReview();
  }

  function playbackTick(ts) {
    if (!state.review.playing || !state.currentPlay) return;
    const delta = ts - state.review.lastTs;
    state.review.lastTs = ts;
    const duration = 1650 / state.review.speed;
    state.review.progress += delta / duration;
    if (state.review.progress >= 1) {
      state.review.progress = 1;
      state.review.playing = false;
    }
    renderReview();
    if (state.review.playing) state.review.raf = requestAnimationFrame(playbackTick);
  }

  function jumpReviewStep(index) {
    if (!state.currentPlay) return;
    state.review.index = Math.max(0, Math.min(state.currentPlay.steps.length - 1, index));
    state.review.progress = 0;
    state.review.playing = false;
    renderReview();
  }

  function restartPlayback() {
    if (!state.currentPlay) return;
    state.review.index = 0;
    state.review.progress = 0;
    state.review.playing = false;
    renderReview();
  }

  function toggleReviewFullscreen() {
    if (!state.currentPlay) return;
    const target = document.getElementById('reviewScreen');
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      target.classList.remove('ios-fullscreen');
      els.fullscreenBtn.setAttribute('aria-label', 'Full screen');
      renderReview();
      return;
    }

    if (target.requestFullscreen) {
      target.requestFullscreen().catch(() => enableReviewFullscreenFallback(target));
    } else {
      enableReviewFullscreenFallback(target);
    }
  }

  function enableReviewFullscreenFallback(target) {
    const active = target.classList.toggle('ios-fullscreen');
    document.body.classList.toggle('review-fullscreen-active', active);
    els.fullscreenBtn.setAttribute('aria-label', active ? 'Exit full screen' : 'Full screen');
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

  function getDraftActionStart(step, actorId, type) {
    if (['move', 'dribble', 'screen'].includes(type)) {
      const previous = [...step.actions].reverse().find((action) =>
        action.actorId === actorId && ['move', 'dribble', 'screen'].includes(action.type)
      );
      if (previous) return { ...previous.to };
    }
    return getActorPosition(step, actorId);
  }

  function canContinueAction(action) {
    return ['move', 'dribble', 'screen'].includes(action.type);
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
    const court = getCourtConfig(state.currentPlay?.courtType || 'full');
    return { x: Math.min(court.width - 18, player.x + 22), y: Math.min(court.height - 18, player.y + 19) };
  }

  function actionPathD(action) {
    if (action.type === 'dribble') return wavyPath(action.from, action.to, action.control);
    if (action.control && canCurveAction(action)) {
      return `M ${action.from.x} ${action.from.y} Q ${action.control.x} ${action.control.y} ${action.to.x} ${action.to.y}`;
    }
    return `M ${action.from.x} ${action.from.y} L ${action.to.x} ${action.to.y}`;
  }

  function canCurveAction(action) {
    return ['move', 'dribble', 'screen'].includes(action.type);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function quadraticPoint(from, control, to, t) {
    const one = 1 - t;
    return {
      x: one * one * from.x + 2 * one * t * control.x + t * t * to.x,
      y: one * one * from.y + 2 * one * t * control.y + t * t * to.y
    };
  }

  function wavyPath(from, to, control = null) {
    const curveControl = control || midpoint(from, to);
    const start = from;
    const end = to;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const segments = Math.max(8, Math.round(len / 22));
    let d = `M ${start.x} ${start.y}`;
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const amp = Math.sin(t * Math.PI * segments) * 11;
      const base = control ? quadraticPoint(start, curveControl, end, t) : { x: start.x + dx * t, y: start.y + dy * t };
      const x = base.x + nx * amp;
      const y = base.y + ny * amp;
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

  function exportPlaybookJson() {
    saveCurrentPlayToLibrary();
    exportJson(createPlaybookSnapshot(), 'playbook-live.json');
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

  function createPlaybookSnapshot() {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: 'Playbook Live',
      plays: clone(state.plays)
    };
  }

  function parsePlaybookSnapshot(data, options = {}) {
    if (options.strict) validatePlaybookSnapshot(data);
    const plays = Array.isArray(data?.plays) ? clone(data.plays) : [];
    if (!Array.isArray(data?.plays)) throw new Error('GitHub file does not contain a plays array');
    plays.forEach(normalizePlay);
    return plays;
  }

  function validatePlaybookSnapshot(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Playbook JSON must be an object');
    if (data.schemaVersion !== 1) throw new Error('Playbook JSON has an unsupported schema version');
    if (!Array.isArray(data.plays)) throw new Error('Playbook JSON must contain a plays array');
    data.plays.forEach((play, playIndex) => {
      if (!play || typeof play !== 'object' || Array.isArray(play)) throw new Error(`Play ${playIndex + 1} is not valid`);
      if (play.schemaVersion !== 1) throw new Error(`Play ${playIndex + 1} has an unsupported schema version`);
      if (typeof play.id !== 'string' || !play.id) throw new Error(`Play ${playIndex + 1} is missing an id`);
      if (!Array.isArray(play.steps) || play.steps.length === 0) throw new Error(`Play ${playIndex + 1} must contain steps`);
      play.steps.forEach((step, stepIndex) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) throw new Error(`Play ${playIndex + 1}, step ${stepIndex + 1} is not valid`);
        if (!step.entities || typeof step.entities !== 'object' || Array.isArray(step.entities)) throw new Error(`Play ${playIndex + 1}, step ${stepIndex + 1} is missing entities`);
        if (!Array.isArray(step.entities.players)) throw new Error(`Play ${playIndex + 1}, step ${stepIndex + 1} is missing players`);
        if (!Array.isArray(step.actions)) throw new Error(`Play ${playIndex + 1}, step ${stepIndex + 1} is missing actions`);
      });
    });
  }

  async function loadPlayerPlaybook() {
    setPlayerStatus('loading', 'Updating playbook...');
    try {
      const data = await fetchPlayerSnapshot();
      const plays = parsePlaybookSnapshot(data, { strict: true });
      state.plays = plays;
      state.currentPlay = state.plays[0] ? clone(state.plays[0]) : null;
      state.currentStepIndex = 0;
      state.review.index = 0;
      state.review.progress = 0;
      state.review.playing = false;
      localStorage.setItem(PLAYER_CACHE_KEY, JSON.stringify(data));
      setPlayerStatus('hidden', '');
      renderAll();
    } catch (error) {
      console.error(error);
      const cached = loadPlayerCache();
      if (cached) {
        state.plays = cached.plays;
        state.currentPlay = state.plays[0] ? clone(state.plays[0]) : null;
        state.currentStepIndex = 0;
        state.review.index = 0;
        state.review.progress = 0;
        state.review.playing = false;
        setPlayerStatus('warning', 'Could not update playbook. Showing the last downloaded version.');
        renderAll();
        return;
      }
      state.plays = [];
      state.currentPlay = null;
      renderAll();
      setPlayerStatus('error', error.message?.includes('schema') || error.message?.includes('Playbook JSON')
        ? 'Playbook data is invalid. Please try again later.'
        : 'Playbook could not be loaded. Please check your connection and try again.');
    }
  }

  async function fetchPlayerSnapshot() {
    const response = await fetch(`${PLAYER_JSON_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Playbook could not be loaded. HTTP ${response.status}`);
    return response.json();
  }

  function loadPlayerCache() {
    try {
      const data = JSON.parse(localStorage.getItem(PLAYER_CACHE_KEY) || 'null');
      if (!data) return null;
      return { plays: parsePlaybookSnapshot(data, { strict: true }) };
    } catch (error) {
      console.warn('Player cache ignored because it is invalid.', error);
      return null;
    }
  }

  function setPlayerStatus(kind, message) {
    if (!els.playerStatus) return;
    els.playerStatus.className = `player-status ${kind === 'hidden' ? 'hidden' : kind}`;
    const statusMessage = els.playerStatus.querySelector('[data-player-status-message]');
    if (statusMessage) statusMessage.textContent = message;
    els.retryPlayerLoadBtn?.classList.toggle('hidden', kind !== 'error');
  }

  function replacePlaybookSnapshot(data) {
    state.plays = [];
    persistLocalPlays();
    localStorage.removeItem(STORAGE.current);

    state.plays = parsePlaybookSnapshot(data);
    persistLocalPlays();
    state.currentPlay = state.plays[0] ? clone(state.plays[0]) : createNewPlay();
    state.currentStepIndex = 0;
    state.selected = null;
    state.draftAction = null;
    state.undoStack = [];
    state.redoStack = [];
    state.review.index = 0;
    state.review.progress = 0;
    state.review.playing = false;
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

  async function copyPlayerLink() {
    try {
      await navigator.clipboard.writeText(PLAYER_LINK);
      showToast('Player link copied');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = PLAYER_LINK;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      showToast('Player link copied');
    }
  }

  function lockCoachMode() {
    localStorage.removeItem(COACH_UNLOCK_KEY);
    window.location.reload();
  }

  function requireGitHubSaveSettings() {
    const settings = getGitHubSettings();
    if (!settings.owner || !settings.repo || !settings.branch || !settings.path || !settings.token) {
      els.settingsDialog.showModal();
      showToast('Add GitHub save settings first');
      return null;
    }
    return settings;
  }

  async function savePlaybookToGitHub() {
    const settings = requireGitHubSaveSettings();
    if (!settings) return;
    if (!confirm('This will overwrite the GitHub playbook snapshot. Continue?')) return;
    saveCurrentPlayToLibrary();
    const body = createPlaybookSnapshot();
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
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      showSyncResult('success', 'Saved to GitHub', `Uploaded ${state.plays.length} play${state.plays.length === 1 ? '' : 's'} to ${settings.owner}/${settings.repo}:${settings.path}.`);
    } catch (error) {
      console.error(error);
      showSyncResult('error', 'GitHub save failed', 'The playbook was not saved to GitHub.', error.message || String(error));
    }
  }

  async function loadPlaybookFromGitHub() {
    if (!confirm('Loading from GitHub will completely replace your current local playbook. Continue?')) return;
    const url = publicPlaybookUrl();
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json();
      replacePlaybookSnapshot(data);
      showSyncResult('success', 'Loaded from GitHub', `Loaded ${state.plays.length} play${state.plays.length === 1 ? '' : 's'} from the published playbook JSON.`);
    } catch (error) {
      console.error(error);
      showSyncResult('error', 'GitHub load failed', 'The playbook was not loaded from GitHub.', error.message || String(error));
    }
  }

  function publicPlaybookUrl() {
    const settings = getGitHubSettings();
    const path = settings.path?.trim() || PLAYER_JSON_URL;
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${Date.now()}`;
  }

  function showSyncResult(kind, title, message, details = '') {
    els.syncResultKicker.textContent = kind === 'success' ? 'GitHub snapshot saved' : 'GitHub snapshot error';
    els.syncResultTitle.textContent = title;
    els.syncResultMessage.textContent = message;
    els.syncResultDetails.textContent = details;
    els.syncResultDetails.classList.toggle('hidden', !details);
    els.syncResultDialog.showModal();
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
