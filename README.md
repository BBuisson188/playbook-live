# Playbook Live

A mobile-first basketball playbook web app for building step-based plays and reviewing them with animated playback.

This starter is intentionally built as a static app so it can run on GitHub Pages and be saved to an iPhone or iPad home screen as a PWA.

## What is included

- Polished mobile-first interface
- Editor, Playbook, and Review screens
- SVG editor layered over per-play half-court or full-court PNG backgrounds from `assets/`
- Blue offense players numbered 1 to 5
- Red defense players numbered 1 to 5
- Basketball placement and possession attachment
- Four action types:
  - Green solid cut/movement line
  - Yellow dashed pass line
  - Blue wavy dribble line
  - Blunt-end screen line
- Arrowheads for movement, pass, and dribble
- Step-based play creation
- Next Step behavior that advances players and ball to the end of the current action paths
- Smart adjacent-step linking when editing a previous step
- Undo and redo
- Select, delete, and basic endpoint editing
- Local playbook saving with `localStorage`
- Per-step previous-motion shadows
- Manual GitHub save/load through the GitHub Contents API
- Full-sequence animated review with play/pause, restart, step forward/back, speed control, and short pauses between steps
- Per-action delayed starts and touch-friendly press-and-hold tooltips
- PWA manifest and service worker
- App icons

## How to run locally

Serve the folder with a local server so the public JSON can be fetched. The default page opens player mode; the editor is at `coach.html`.

Example:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## GitHub Pages

This app is static. It can be published from the repository root or from a `/docs` folder depending on the repo setup.

For GitHub Pages, make sure these files are included:

```text
index.html
styles.css
app.js
manifest.json
sw.js
assets/
HANDOFF.md
README.md
```

## GitHub snapshot setup

The app has manual GitHub snapshot buttons:

- Save to GitHub
- Load from GitHub

Open the gear icon and enter:

- Owner
- Repository
- Branch
- File path, such as `data/playbook-live.json`
- A GitHub token

For personal use, create a fine-grained GitHub token with repository Contents read/write access. The token is stored only in the browser's local storage.

Save to GitHub overwrites the configured JSON file with the entire local playbook snapshot. Load from GitHub completely replaces the local playbook with that snapshot after confirmation.

## Main usage flow

### Library organization

- Open **Categories** in the coach Playbook to add or rename categories.
- Assign a play using its category dropdown in the library or editor.
- Turn off **Visible to players** to keep a category in coach mode while hiding it in player mode.
- Use the up/down arrows to reorder plays within a category. The order is saved locally immediately.
- Search and category filters are available in both modes.
- Open **Publishing** for Copy Player Link, Save to GitHub, and Load from GitHub. Saving publishes category names, order, and visibility along with plays. Loading requires no credentials and fetches the live public playbook even when the editor is running locally. A configured repository/branch/file path is honored for public reads.
- Hidden categories are filtered out of the player interface; the public JSON still contains them so coaches can restore them. This is not private storage. Previously downloaded offline versions remain available until the device reconnects.

### Step controls

- Previous/Next only navigate existing steps; **Add Step** creates a step after the selected one.
- The step dropdown jumps directly to any step.
- **Delete Step** removes the selected step, keeping at least one step per play.
- **Last Step** removes every step after the selected step, after confirmation.
- Both deletion operations support Undo. Save the play to retain the edit, then save to GitHub to update players.
- **Previous step shadow** shows the immediately preceding step's paths at reduced opacity behind the selected step. It is saved independently for each step, supports Undo, and also appears during review and in player mode. The first step has no previous step, so its toggle is disabled.
- Tap a pass, cut, dribble, or screen to reveal **Delay start**. The switch also appears immediately after drawing an action, without changing tools. Delayed actions wait until halfway through the step and animate during the remaining time. The setting supports Undo/Redo and is published with the play.
- The compact Delay switch floats in the court's top corner and does not change the court size.
- Review plays through the remaining steps automatically. At normal speed, each step lasts 1.65 seconds with a one-third-second pause before the next step. The speed slider scales both movement and pauses. Playback stops at the final position; pressing Play again replays from the beginning.
- Review's next/back arrows animate one step forward or rewind to the preceding step's start, rather than jumping between static diagrams. Manual stepping also follows the speed slider.
- Screeners stop short of the black T marker; the marker is also retained in previous-step shadows. Linked positions in existing plays are adjusted in memory to avoid a jump after a screen.
- During dribbles the basketball grows and shrinks subtly as it follows the player. Delayed dribbles start that pulse only when the action begins.
- On iPad, hold an icon button to see its description. Holding shows help without activating the control. Undo reverses the last edit; Redo restores an undone edit. Desktop hover and keyboard focus also show tooltips.

### Editing

1. Open Editor.
2. Tap Offense or Defense, then tap the court to place players.
3. Tap Ball, then tap the court or a player.
4. Select Cut, Pass, Dribble, or Screen.
5. Drag from a player or the ball to create an action.
6. Tap Next Step to advance the play to the result of the current actions.
7. Repeat for additional steps.
8. Tap Save to store the play locally.
9. Open Review to animate the play.

## Notes

Run the data and playback regression tests with `node --test`.
The optional `node tests/browser-smoke.cjs` check requires Playwright and Chrome; set `PLAYWRIGHT_MODULE` to a bundled Playwright module path if it is not locally installed. It uses an isolated browser, starts its own temporary HTTP server, and closes both after testing. Screenshots are written to the ignored `.test-results/` folder.

This is a complete first-version starter, but it is still meant for Codex iteration. The highest-value improvements are listed in `HANDOFF.md`.
