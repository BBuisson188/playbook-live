const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const published = require('../data/playbook-live.json');
const clone = (data) => JSON.parse(JSON.stringify(data));
const template = clone(published.plays[0]);
const plays = ['Alpha', 'Bravo', 'Charlie'].map((name, index) => ({ ...clone(template), id: name.toLowerCase(), name, categoryId: null,
  steps: Array.from({ length: index === 0 ? 40 : 1 }, (_, step) => ({ ...clone(template.steps[index === 0 ? Math.min(step, template.steps.length - 1) : 0]), id: `${name}-${step}` })) }));
let servedSnapshot = { schemaVersion: 1, plays: clone(plays), categories: [] };
let savedSnapshot;
let browser;
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/data/playbook-live.json') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(servedSnapshot));
      return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const content = await fs.readFile(file);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(content);
  } catch { response.writeHead(404).end(); }
});

async function run() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const errors = [];
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await context.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await context.route('https://bbuisson188.github.io/playbook-live/data/playbook-live.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(servedSnapshot) }));
  await context.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(servedSnapshot) }));
  await context.route('https://api.github.com/repos/**', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      savedSnapshot = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      return route.fulfill({ contentType: 'application/json', body: '{"content":{"sha":"new-sha"}}' });
    }
    return route.fulfill({ contentType: 'application/json', body: '{"sha":"test-sha"}' });
  });
  await page.addInitScript((plays) => {
    if (localStorage.getItem('smoke-seeded')) return;
    localStorage.setItem('playbook-live:coach-unlocked', 'true');
    localStorage.setItem('playbook-live:plays:v1', JSON.stringify(plays));
    localStorage.setItem('playbook-live:current-play-id:v1', 'alpha');
    localStorage.setItem('smoke-seeded', 'true');
  }, plays);
  await page.goto(`${origin}/coach.html`);
  await page.locator('#editorStepSelect option').nth(39).waitFor({ state: 'attached' });
  await page.locator('[data-tool="select"]').click();
  const actionPoint = await page.locator('#courtSvg .actions-layer path[data-action-id]').first().evaluate((path) => {
    for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const point = path.getPointAtLength(path.getTotalLength() * fraction);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
      if (document.elementFromPoint(screen.x, screen.y)?.getAttribute('data-action-id') === path.dataset.actionId) {
        return { x: screen.x, y: screen.y, id: path.dataset.actionId };
      }
    }
    throw new Error('No unobstructed action point for selection test');
  });
  await page.mouse.click(actionPoint.x, actionPoint.y);
  await page.locator('#actionInspector:not(.hidden)').waitFor();
  await page.check('#actionDelayToggle');
  assert.match(await page.locator('#actionTimingLabel').textContent(), /halfway/);
  const undoBounds = await page.locator('#undoBtn').boundingBox();
  await page.mouse.move(undoBounds.x + undoBounds.width / 2, undoBounds.y + undoBounds.height / 2);
  await page.mouse.down();
  await page.locator('#controlTooltip:not(.hidden)').filter({ hasText: 'Undo' }).waitFor();
  await fs.mkdir(path.join(root, '.test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, '.test-results/action-delay-help.png') });
  await page.mouse.up();
  assert.equal(await page.locator('#actionDelayToggle').isChecked(), true, 'Holding Undo must not perform Undo');
  await page.click('#undoBtn');
  assert.equal(await page.locator('#actionDelayToggle').isChecked(), false);
  await page.click('#redoBtn');
  assert.equal(await page.locator('#actionDelayToggle').isChecked(), true);
  const redoBounds = await page.locator('#redoBtn').boundingBox();
  await page.mouse.move(redoBounds.x + redoBounds.width / 2, redoBounds.y + redoBounds.height / 2);
  await page.mouse.down();
  await page.locator('#controlTooltip:not(.hidden)').filter({ hasText: 'Redo' }).waitFor();
  await page.mouse.up();
  assert.equal(await page.locator('#actionDelayToggle').isChecked(), true);
  await page.keyboard.press('Escape');
  for (const [name, width, height] of [['phone', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 900], ['landscape', 844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const inspectorFits = await page.evaluate(() => {
      const svg = document.querySelector('#courtSvg');
      const inspector = document.querySelector('#actionInspector');
      const shown = svg.getBoundingClientRect();
      inspector.style.display = 'none';
      const hidden = svg.getBoundingClientRect();
      inspector.style.removeProperty('display');
      return shown.height > 60 && Math.abs(shown.height - hidden.height) < 1 && Math.abs(shown.width - hidden.width) < 1 && getComputedStyle(inspector).position === 'absolute';
    });
    assert.equal(inspectorFits, true, `Action settings must not shrink the court on ${name}`);
    await page.screenshot({ path: path.join(root, `.test-results/action-delay-${name}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  console.log('PASS: selecting an action exposes delay; undo/redo work; holding enabled and disabled controls explains without activating');
  assert.equal(await page.locator('#previousStepShadow').isDisabled(), true);
  await page.selectOption('#editorStepSelect', '5');
  await page.check('#previousStepShadow');
  assert.equal(await page.locator('#courtSvg .previous-step-layer').count(), 1);
  assert.equal(await page.locator('#courtSvg .previous-step-layer [data-action-id]').count(), 0);
  assert.equal(await page.locator('#courtSvg .previous-step-layer .edit-handle').count(), 0);
  await page.click('#undoBtn');
  assert.equal(await page.locator('#courtSvg .previous-step-layer').count(), 0);
  await page.check('#previousStepShadow');
  await page.click('#lastStepBtn');
  assert.equal(await page.locator('#editorStepSelect option').count(), 6);
  await page.click('#undoBtn');
  assert.equal(await page.locator('#editorStepSelect option').count(), 40);
  await page.click('#lastStepBtn');
  await page.click('#deleteStepBtn');
  assert.equal(await page.locator('#editorStepSelect option').count(), 5);
  await page.check('#previousStepShadow');
  await page.click('#savePlayBtn');
  assert.equal(await page.locator('#nextStepBtn').isDisabled(), true);
  await page.click('#addStepBtn');
  assert.equal(await page.locator('#editorStepSelect option').count(), 6);
  await page.click('#undoBtn');
  assert.equal(await page.locator('#editorStepSelect option').count(), 5);
  console.log('PASS: forty-step trim, undo, delete, and explicit add-step controls');

  await page.click('[data-screen="playbook"]');
  await page.locator('[data-play-id="alpha"] [data-order-direction="down"]').click();
  assert.deepEqual(await page.locator('[data-play-id]').evaluateAll((cards) => cards.map((card) => card.dataset.playId)), ['bravo', 'alpha', 'charlie']);
  await page.reload();
  await page.click('[data-screen="playbook"]');
  assert.deepEqual(await page.locator('[data-play-id]').evaluateAll((cards) => cards.map((card) => card.dataset.playId)), ['bravo', 'alpha', 'charlie']);
  console.log('PASS: touch-friendly play ordering persists after reload');

  await page.click('#manageCategoriesBtn');
  for (const name of ['Zone', 'Inbounds', 'Later']) {
    await page.fill('#newCategoryName', name);
    await page.locator('#addCategoryForm button').click();
  }
  const categories = await page.evaluate(() => JSON.parse(localStorage.getItem('playbook-live:categories:v1')));
  const zone = categories.find((category) => category.name === 'Zone').id;
  const later = categories.find((category) => category.name === 'Later').id;
  await page.locator(`[data-category-id="${later}"] [data-category-visible]`).uncheck();
  await page.click('#closeCategoriesBtn');
  await page.selectOption('[data-play-category="alpha"]', zone);
  await page.selectOption('[data-play-category="charlie"]', later);
  await page.fill('#librarySearch', 'Alpha');
  assert.equal(await page.locator('[data-play-id]').count(), 1);
  await page.fill('#librarySearch', '');
  await page.selectOption('#libraryCategoryFilter', later);
  assert.equal(await page.locator('[data-play-id]').count(), 1);
  await page.selectOption('#libraryCategoryFilter', 'all');
  console.log('PASS: category creation, assignment, search, filters, and hidden status');

  await page.locator('.library-sync-menu > summary').click();
  assert.equal(await page.locator('#exportPlaybookBtn, #importPlaybookBtn, #importPlaybookInput').count(), 0);
  await page.evaluate(() => localStorage.setItem('playbook-live:github-settings:v1', JSON.stringify({ owner: 'Coach', repo: 'Plays', branch: 'main', path: 'data/playbook-live.json', token: 'test-token-not-real' })));
  await page.click('#saveGitHubBtn');
  await page.locator('#syncResultDialog[open]').waitFor();
  assert.match(await page.locator('#syncResultTitle').textContent(), /Saved/);
  await page.locator('#syncResultDialog button').last().click();
  const snapshot = savedSnapshot;
  assert.equal(snapshot.categories.length, 3);
  assert.equal(snapshot.categories.find((category) => category.id === later).hidden, true);
  assert.equal(snapshot.plays.find((play) => play.id === 'alpha').steps.length, 5);
  assert.equal(snapshot.plays.find((play) => play.id === 'alpha').steps[4].showPreviousStep, true);
  assert.equal(snapshot.plays.find((play) => play.id === 'alpha').steps[0].actions.find((action) => action.id === actionPoint.id).delayed, true);
  servedSnapshot = snapshot;
  await page.locator('[data-play-id="alpha"] [data-library-action="open"]').click();
  assert.equal(await page.inputValue('#editorCategory'), zone);
  assert.equal(await page.locator('#editorStepSelect option').count(), 5);
  await page.selectOption('#editorStepSelect', '4');
  assert.equal(await page.locator('#previousStepShadow').isChecked(), true);
  await fs.mkdir(path.join(root, '.test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, '.test-results/coach-shadow.png') });
  console.log('PASS: GitHub publishing preserves categories, step shadows, ordering, and trimmed steps; import/export removed');

  await page.click('[data-screen="playbook"]');
  servedSnapshot = { schemaVersion: 1, categories: 'bad', plays: [] };
  const beforeLoad = await page.evaluate(() => localStorage.getItem('playbook-live:plays:v1'));
  await page.click('#loadGitHubBtn');
  await page.locator('#syncResultDialog[open]').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('playbook-live:plays:v1')), beforeLoad);
  await page.locator('#syncResultDialog button').last().click();
  await page.evaluate(() => localStorage.removeItem('playbook-live:github-settings:v1'));
  servedSnapshot = snapshot;
  await page.click('#loadGitHubBtn');
  await page.locator('#syncResultDialog[open]').waitFor();
  assert.match(await page.locator('#syncResultTitle').textContent(), /Loaded/);
  await page.locator('#syncResultDialog button').last().click();
  console.log('PASS: credential-free load retains categories; invalid loads preserve saved data');

  await fs.mkdir(path.join(root, '.test-results'), { recursive: true });
  await page.locator('#toast').waitFor({ state: 'hidden' });
  for (const [name, width, height] of [['phone', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 900], ['landscape', 844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.click('[data-screen="create"]');
    const fits = await page.evaluate(() => {
      const court = document.querySelector('#courtSvg').getBoundingClientRect();
      const wrap = document.querySelector('#courtSvg').parentElement.getBoundingClientRect();
      const buttonsFit = [...document.querySelectorAll('.editor-footer button')].every((button) => button.scrollWidth <= button.clientWidth + 1);
      return buttonsFit && court.height > 60 && court.width > 60 && court.bottom <= wrap.bottom + 1 && court.top >= wrap.top - 1 && document.documentElement.scrollWidth <= innerWidth;
    });
    assert.equal(fits, true, `Editor court must remain usable at ${name}`);
    await page.screenshot({ path: path.join(root, `.test-results/coach-${name}.png`) });
    await page.click('[data-screen="playbook"]');
    if (await page.locator('.library-sync-menu').getAttribute('open') !== null) await page.locator('.library-sync-menu > summary').click();
    await page.screenshot({ path: path.join(root, `.test-results/library-${name}.png`) });
  }
  console.log('PASS: nonblank court and no horizontal page overflow on phone, tablet, desktop, landscape');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#newPlayBtn');
  await page.click('[data-court-type="half"]');
  await page.click('[data-tool="offense"]');
  const courtBounds = await page.locator('#courtSvg').boundingBox();
  await page.locator('#courtSvg').click({ position: { x: courtBounds.width * 0.35, y: courtBounds.height * 0.45 } });
  assert.equal(await page.locator('#courtSvg .player-node').count(), 1);
  await page.locator('[data-tool="ball"]').click();
  await page.locator('#courtSvg .player-node').click();
  assert.equal(await page.locator('#courtSvg .ball-node').count(), 1);
  await page.locator('[data-tool="move"]').click();
  const playerBounds = await page.locator('#courtSvg .player-node').boundingBox();
  const x = playerBounds.x + playerBounds.width / 2;
  const y = playerBounds.y + playerBounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 45, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.locator('#courtSvg .action-move').count(), 1);
  await page.click('#addStepBtn');
  assert.equal(await page.locator('#editorStepSelect option').count(), 2);
  await page.click('#undoBtn');
  assert.equal(await page.locator('#editorStepSelect option').count(), 1);
  console.log('PASS: original court choice, player/ball placement, movement drawing, step creation and undo');

  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const player = await playerContext.newPage();
  player.on('pageerror', (error) => errors.push(error.message));
  await player.goto(`${origin}/`);
  await player.locator('[data-play-id="alpha"]').waitFor();
  assert.equal(await player.locator('[data-play-id="charlie"]').count(), 0);
  assert.equal(await player.locator('#libraryCategoryFilter option').filter({ hasText: 'Later' }).count(), 0);
  assert.equal(await player.locator('[data-order-target], [data-play-category], #deleteStepBtn').count(), 0);
  await player.locator('[data-play-id="alpha"] [data-library-action="review"]').click();
  await player.locator('#speedSlider').focus();
  await player.locator('#speedSlider').press('End');
  for (let index = 0; index < 4; index += 1) {
    await player.click('#reviewForwardBtn');
    await player.waitForFunction((step) => document.querySelector('#reviewStepStatus').textContent === `Step ${step} of 5`, index + 2);
  }
  await player.click('#reviewBackBtn');
  await player.waitForFunction(() => document.querySelector('#reviewStepStatus').textContent.includes('Rewinding'));
  await player.waitForFunction(() => document.querySelector('#reviewStepStatus').textContent === 'Step 4 of 5');
  await player.click('#reviewForwardBtn');
  await player.waitForFunction(() => document.querySelector('#reviewStepStatus').textContent === 'Step 5 of 5');
  assert.equal(await player.locator('#reviewSvg .previous-step-layer').count(), 1);
  await player.click('#playPauseBtn');
  await player.waitForFunction(() => document.querySelector('#playPauseBtn').textContent === '\u23f8');
  await player.click('#playPauseBtn');
  await player.screenshot({ path: path.join(root, '.test-results/player-review.png') });
  await player.click('#restartBtn');
  await player.locator('#speedSlider').focus();
  await player.locator('#speedSlider').press('End');
  assert.equal(await player.inputValue('#speedSlider'), '2');
  await player.click('#playPauseBtn');
  await player.waitForFunction(() => document.querySelector('#reviewStepStatus').textContent.includes('Pause'), null, { timeout: 7000 });
  await player.click('#playPauseBtn');
  const pausedStep = await player.locator('#reviewStepStatus').textContent();
  await player.waitForTimeout(450);
  assert.equal(await player.locator('#reviewStepStatus').textContent(), pausedStep);
  await player.click('#playPauseBtn');
  await player.waitForFunction(() => document.querySelector('#reviewStepStatus').textContent.startsWith('Step 2 of 5'), null, { timeout: 5000 });
  await player.waitForFunction(() => document.querySelector('#reviewStepStatus').textContent.includes('Complete'), null, { timeout: 15000 });
  assert.equal(await player.locator('#playPauseBtn').getAttribute('aria-label'), 'Play full sequence');
  await player.click('#playPauseBtn');
  await player.waitForFunction(() => document.querySelector('#reviewStepStatus').textContent.startsWith('Step 1 of 5'));
  await player.click('#playPauseBtn');
  console.log('PASS: continuous full-play review, inter-step hold, pause/resume during hold, speed changes and replay from the beginning');
  await player.route('**/data/playbook-live.json*', (route) => route.abort());
  await player.reload();
  await player.locator('.player-status.warning').waitFor();
  assert.equal(await player.locator('[data-play-id="charlie"]').count(), 0);
  assert.equal(await player.locator('[data-play-id="alpha"]').count(), 1);
  console.log('PASS: player categories, hidden filtering, read-only review, and offline cache');
  const cachedJson = await player.evaluate(() => localStorage.getItem('playbook-live:player-json-cache'));
  await player.route('**/data/playbook-live.json*', (route) => route.fulfill({ contentType: 'application/json', body: '{"schemaVersion":1,"plays":[],"categories":null}' }));
  await player.reload();
  await player.locator('.player-status.warning').waitFor();
  assert.equal(await player.evaluate(() => localStorage.getItem('playbook-live:player-json-cache')), cachedJson);
  assert.equal(await player.locator('[data-play-id="charlie"]').count(), 0);

  const emptyContext = await browser.newContext({ serviceWorkers: 'block', isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  const empty = await emptyContext.newPage();
  await empty.route('**/data/playbook-live.json*', (route) => route.abort());
  await empty.goto(`${origin}/player.html`);
  await empty.locator('.player-status.error').waitFor();
  assert.equal(await empty.locator('#retryPlayerLoadBtn').isVisible(), true);
  assert.equal(await empty.locator('.empty-state').count(), 0);
  const scale = await empty.evaluate(() => visualViewport.scale);
  await empty.locator('h1').tap();
  await empty.locator('h1').tap();
  assert.equal(await empty.evaluate(() => visualViewport.scale), scale);
  assert.equal(await empty.locator('body').evaluate((body) => getComputedStyle(body).userSelect), 'none');
  assert.equal(await empty.locator('#librarySearch').evaluate((input) => getComputedStyle(input).userSelect), 'text');
  await empty.unroute('**/data/playbook-live.json*');
  await empty.click('#retryPlayerLoadBtn');
  await empty.locator('[data-play-id="alpha"]').waitFor();
  await empty.evaluate(() => localStorage.setItem('playbook-live:coach-unlocked', 'true'));
  await empty.goto(`${origin}/coach.html`);
  await empty.click('[data-screen="playbook"]');
  assert.equal(await empty.locator('[data-play-id]').count(), 0);
  const touch = await emptyContext.newCDPSession(empty);
  const disabledUndo = await empty.locator('#undoBtn').boundingBox();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: disabledUndo.x + disabledUndo.width / 2, y: disabledUndo.y + disabledUndo.height / 2 }] });
  await empty.locator('#controlTooltip:not(.hidden)').filter({ hasText: 'Undo' }).waitFor();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await empty.locator('[data-play-id]').count(), 0);
  console.log('PASS: real touch long-press shows help for disabled Undo without triggering an edit');
  console.log('PASS: invalid JSON preserves cache; empty-cache errors retry; touch zoom and selection guards');

  const offlineContext = await browser.newContext({ serviceWorkers: 'allow' });
  const offline = await offlineContext.newPage();
  await offline.goto(`${origin}/player.html`);
  await offline.locator('[data-play-id="alpha"]').waitFor();
  await offline.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await offlineContext.setOffline(true);
  await offline.reload();
  await offline.locator('.player-status.warning').waitFor();
  assert.equal(await offline.locator('[data-play-id="alpha"]').count(), 1);
  assert.equal(await offline.locator('[data-play-id="charlie"]').count(), 0);
  console.log('PASS: real service worker reloads the app fully offline with categories and visibility intact');
  if (process.env.LIVE_LOAD_CHECK === '1') {
    const liveContext = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1024, height: 768 } });
    const livePage = await liveContext.newPage();
    livePage.on('dialog', (dialog) => dialog.accept());
    await livePage.addInitScript(() => localStorage.setItem('playbook-live:coach-unlocked', 'true'));
    await livePage.goto(`${origin}/coach.html`);
    await livePage.click('[data-screen="playbook"]');
    await livePage.locator('.library-sync-menu > summary').click();
    await livePage.click('#loadGitHubBtn');
    await livePage.locator('#syncResultDialog[open]').waitFor({ timeout: 20000 });
    assert.match(await livePage.locator('#syncResultTitle').textContent(), /Loaded/);
    const count = await livePage.evaluate(() => JSON.parse(localStorage.getItem('playbook-live:plays:v1')).length);
    assert.ok(count > 0, 'Live public playbook must contain real plays');
    await livePage.locator('#syncResultDialog button').last().click();
    await livePage.screenshot({ path: path.join(root, '.test-results/live-published-library.png') });
    console.log(`PASS: local coach app loads ${count} real plays from the live published URL without credentials`);
    await liveContext.close();
  }
  assert.deepEqual(errors, []);
  await offlineContext.close();
  await emptyContext.close();
  await playerContext.close();
  await context.close();
}

const watchdog = setTimeout(() => { console.error('Browser checks exceeded 110 seconds'); process.exit(1); }, 110000);
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  clearTimeout(watchdog);
});
