# Playbook Live

A mobile-first basketball playbook web app for building step-based plays and reviewing them with animated playback.

This starter is intentionally built as a static app so it can run on GitHub Pages and be saved to an iPhone or iPad home screen as a PWA.

## What is included

- Polished mobile-first interface
- Create, Playbook, and Review screens
- Full-court SVG whiteboard
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
- JSON import and export
- Manual GitHub save/load through the GitHub Contents API
- Animated review mode with play/pause, restart, step forward/back, and speed control
- PWA manifest and service worker
- App icons

## How to run locally

Open `index.html` directly in a browser, or serve the folder with a simple local server.

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

## GitHub sync setup

The app has manual GitHub sync buttons:

- Save to GitHub
- Load from GitHub

Open the gear icon and enter:

- Owner
- Repository
- Branch
- File path, such as `data/playbook-live.json`
- A GitHub token

For personal use, create a fine-grained GitHub token with repository Contents read/write access. The token is stored only in the browser's local storage.

## Main usage flow

1. Open Create.
2. Tap Offense or Defense, then tap the court to place players.
3. Tap Ball, then tap the court or a player.
4. Select Cut, Pass, Dribble, or Screen.
5. Drag from a player or the ball to create an action.
6. Tap Next Step to advance the play to the result of the current actions.
7. Repeat for additional steps.
8. Tap Save to store the play locally.
9. Open Review to animate the play.

## Notes

This is a complete first-version starter, but it is still meant for Codex iteration. The highest-value improvements are listed in `HANDOFF.md`.
