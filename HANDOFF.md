# Playbook Live Handoff

## Project summary

Playbook Live is a mobile-first basketball playbook web app. The goal is to let a coach design a play on a phone or iPad, step through the play, save it to a local playbook, sync it manually through GitHub, and review the play with animated movement.

The app should feel polished and finished, not like a throwaway beta. The intended style is a premium sports-tech coaching app: dark navy background, clean court, glassy panels, strong blue/red player markers, smooth animation, and phone-friendly controls.

This version is a static vanilla HTML/CSS/JavaScript app. That is intentional so it can run easily on GitHub Pages and be saved to a mobile home screen.

## Project locations

- GitHub repository: https://github.com/BBuisson188/playbook-live
- Preferred Git remote: `git@github.com:BBuisson188/playbook-live.git`
- Live site: https://bbuisson188.github.io/playbook-live/
- Local project folder: `C:\Users\bbuis\Local Docs\Codex\playbook-live`

## Publishing notes

Publishing is fixed and working through local Git over SSH. Use SSH, not HTTPS, for repository publishing.

- Repo: `git@github.com:BBuisson188/playbook-live.git`
- Branch: `main` now tracks `origin/main`
- Latest push succeeded: `9dd9701..35cb8a6 main -> main`
- Do not use HTTPS credentials.
- Do not use GitHub API publishing unless local Git is truly impossible.

The preferred remote is:

```text
git@github.com:BBuisson188/playbook-live.git
```

The Windows `.git` ACL recovery worked:

```powershell
icacls .git /reset /T
icacls .git /inheritance:d /T
```

Future publishing should use the normal workflow:

```powershell
git add .
git commit -m "message"
git pull --rebase
git push
```

If `git push` is rejected with a message like `fetch first`, run:

```powershell
git pull --rebase
git push
```

If Git write permissions fail with `.git/index.lock`, run this from normal PowerShell:

```powershell
cd "C:\Users\bbuis\Local Docs\Codex\playbook-live"
icacls .git /reset /T
icacls .git /inheritance:d /T
git status
```

## Files

```text
index.html        Main app shell and screens
styles.css        Full visual design and responsive layout
app.js            App state, editor, renderer, playback, storage, GitHub sync
manifest.json     PWA manifest
sw.js             Basic service worker for offline caching
assets/icon.svg   App icon source
assets/*.png      PWA and Apple touch icons
README.md         User-facing setup notes
HANDOFF.md        This handoff file
```

## Current app name

Playbook Live

## Core design decisions

### 1. Static PWA first

The app is designed to run without a build step. This keeps setup simple and helps the user conserve Codex credits. Codex can later refactor this into React/Vite if desired, but the first version should remain runnable from the zip immediately.

### 2. SVG court and vector entities

The court, players, ball, and actions are drawn as SVG. This makes the app sharp on phones and tablets, and it makes editing paths easier than bitmap canvas drawing.

### 3. Steps are state plus actions

Each step stores the starting state of the court and the planned actions for that step.

A step has:

```js
{
  id: string,
  notes: string,
  entities: {
    players: Player[],
    ball: Ball | null
  },
  actions: Action[]
}
```

The next step is derived from the previous step by applying the previous step's actions.

This is the most important mental model in the app:

```text
Step N starting positions + Step N actions = Step N ending positions
Step N ending positions = Step N+1 starting positions
```

## Data model

### Play

```js
{
  schemaVersion: 1,
  id: 'play_...',
  name: 'New Play',
  description: '',
  tags: [],
  courtType: 'half' | 'full' | null,
  createdAt: ISOString,
  updatedAt: ISOString,
  steps: Step[]
}
```

New plays intentionally start with `courtType: null` so the Editor prompts for Half or Full court before drawing begins. Existing plays without this field normalize to `full`.

### Player

```js
{
  id: 'o_...' | 'd_...',
  side: 'offense' | 'defense',
  number: 1,
  x: 300,
  y: 450
}
```

Offense is blue. Defense is red. Both can have players numbered 1 to 5. The app does not require all players to be used.

### Ball

```js
{
  x: 322,
  y: 469,
  ownerId: 'o_...' | 'd_...' | null
}
```

If `ownerId` is set, the ball visually follows that player. If `ownerId` is null, the ball is free at its x/y location.

### Action

```js
{
  id: 'act_...',
  type: 'move' | 'pass' | 'dribble' | 'screen',
  actorId: playerId | 'ball',
  from: { x, y },
  to: { x, y },
  targetPlayerId: playerId | null
}
```

Action types:

- `move`: green solid cut or player movement line
- `pass`: yellow dashed ball pass line
- `dribble`: blue wavy dribble line
- `screen`: blunt-end screen line

Movement, pass, and dribble have arrowheads. Screen uses a blunt bar at the end.

## Editor behavior

### Tools

The editor uses explicit touch modes so phone interactions do not fight each other.

Current tools:

```text
Select
Offense
Defense
Ball
Cut
Pass
Dribble
Screen
Erase
```

### Add players

Tap Offense or Defense, then tap the court. The app adds the next available number from 1 to 5 for that side.

### Add ball

Tap Ball, then tap the court. If the tap is near a player, the ball attaches to that player. Otherwise the ball is free.

### Draw actions

Tap Cut, Pass, Dribble, or Screen. Drag from the player or ball to the destination.

Rules:

- Cut starts from a player.
- Pass can start from the ball or from a player.
- Dribble starts from a player. If there is no ball, the app gives the ball to that player.
- Screen starts from a player.

### Next Step

When the user taps Next Step at the last step, the app creates a new step from the ending positions of the current step.

The current step's action lines do not carry forward visually. The next step starts clean at the new positions.

### Smart adjacent-step editing

The app supports a linked timeline model.

If the user edits the starting position of a player in Step N, the app tries to update the previous step's ending action for that player. Then it recomputes following step starts.

If the user edits an action endpoint in Step N, following steps are recomputed from Step N.

This keeps adjacent steps connected without requiring a complicated global solver.

## Review behavior

The Review screen animates the current play.

Current controls:

- Step back
- Play/pause
- Step forward
- Restart
- Speed slider

Animation is per step. It interpolates players, ball passes, dribbles, and screens between their start and end positions.

## Storage

### Local storage

The playbook is stored in:

```text
playbook-live:plays:v1
```

Current play id is stored in:

```text
playbook-live:current-play-id:v1
```

### JSON import/export

The app can export either a single play or import a single play/playbook JSON.

Supported import shapes:

```js
{ steps: [...] }
```

or

```js
{ plays: [...] }
```

### GitHub sync

Manual GitHub sync is implemented with GitHub's Contents API.

Settings are stored in local storage under:

```text
playbook-live:github-settings:v1
```

The GitHub file shape is:

```js
{
  schemaVersion: 1,
  exportedAt: ISOString,
  app: 'Playbook Live',
  plays: Play[]
}
```

Important security note: the GitHub token is stored only in browser local storage. This is acceptable for this personal-use app, but should not be used for a public multi-user product.

## Known limitations and recommended Codex improvements

### 1. Better path editing

Current editing supports dragging the endpoint handle of an action. A better version should support:

- Dragging start and end handles
- Curved movement paths
- Multi-point routes
- Converting a straight line into a curve
- Fine-tuned screen endpoints

### 2. Better action ordering

Actions are currently applied in array order. For most simple plays this is fine. A stronger version should support explicit action timing within a step, such as:

```js
startTime: 0,
duration: 1,
lane: 'player:o1'
```

This would allow overlapping movement and delayed passes.

### 3. Better ball possession model

The current model uses `ownerId` and simple attachment. Improve it with:

- Explicit handoff action
- Ball snap points
- Pass target selection
- Dribble vs carry distinction
- Ability to show ball with a player without forcing possession across every step

### 4. Better mobile layout polish

The current design is already polished, but Codex should test on real iPhone and iPad screen sizes. Pay special attention to:

- iPhone Safari address bar behavior
- Safe area insets
- Landscape mode
- Bottom nav spacing
- Toolbar horizontal scrolling
- Thumb reach

### 5. Better Playbook metadata

Add fields and UI for:

- Category, such as ATO, BLOB, SLOB, press break, zone offense
- Notes
- Favorite/star
- Search
- Filter
- Duplicate as template

### 6. Better GitHub conflict handling

Current save overwrites the GitHub file if it can fetch the latest sha. Improve this with:

- Last-synced timestamp
- Local dirty state
- Merge by play id
- Conflict warning when GitHub has newer content

### 7. Better PWA install flow

Add a small install/help screen explaining how to save to home screen on iPhone/iPad.

### 8. Add tests

Suggested tests:

- `deriveEndEntities` moves players correctly
- Passes move the ball correctly
- Dribble moves player and ball correctly
- Previous step linking updates correctly
- Import/export preserves schema

This project does not currently include a test runner because it is a simple static app. If Codex converts to Vite, add Vitest.

## Suggested next Codex prompt

```text
You are taking over Playbook Live, a mobile-first basketball playbook PWA. Read README.md and HANDOFF.md first. Do not rebuild from scratch unless absolutely necessary. Preserve the existing static app unless you have a clear reason to refactor.

First, run the app locally and test the full flow on a mobile-sized viewport:
1. Add blue offense players and red defense players.
2. Add the ball.
3. Draw cut, pass, dribble, and screen actions.
4. Tap Next Step and confirm players/ball advance correctly.
5. Edit an earlier step and confirm adjacent steps stay linked.
6. Save a play, open it from Playbook, export/import JSON, and test Review playback.

Then improve the app in this priority order:
1. Fix any bugs discovered during testing.
2. Improve touch editing and path endpoint handles.
3. Improve mobile layout and visual polish while keeping the Playbook Live premium sports-tech style.
4. Add metadata/search/filter to the Playbook screen.
5. Improve GitHub sync conflict handling.

Keep the app easy to deploy on GitHub Pages.
```

## Important user preferences

- The app should not feel like a beta or prototype.
- Use blue numbered circles for offense, not Xs and Os.
- Use red numbered circles for defense, not Xs and Os.
- The app should allow any number of players, including only one player.
- All four line types are required from the beginning: cut, pass, dribble, screen.
- The persistent bottom nav should be Editor, Playbook, Review.
- Manual GitHub save/load is required for cross-device use.
- The user wants to conserve Codex credits, so this starter should be treated as the foundation rather than a disposable mockup.
