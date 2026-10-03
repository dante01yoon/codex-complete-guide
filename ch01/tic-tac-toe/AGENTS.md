# Repository Guidelines

## Project Structure & Module Organization

This repository contains a browser-based, two-player tic-tac-toe game with Korean UI text. All application code lives in `index.html`: inline CSS in `<style>`, semantic HTML in `<body>`, and JavaScript in a closing `<script>`. There are no separate source, test, or asset directories, external dependencies, or package manifests. Keep small changes within this structure.

## Build, Test, and Development Commands

- `open index.html`: launch the game in the default browser on macOS.
- `python3 -m http.server 8000 --bind 127.0.0.1`: optionally serve the repository locally; visit `http://127.0.0.1:8000`.
- `git diff --check`: check unstaged changes for whitespace errors.
- `git diff --cached --check`: check staged changes for whitespace errors.

No compilation, dependency installation, or automated test command is configured.

## Coding Style & Naming Conventions

Follow the existing two-space indentation increments. Use lowercase HTML elements, double-quoted HTML attributes, and hyphenated CSS classes such as `.player-x`. JavaScript uses semicolons, single-quoted strings, and camelCase names such as `currentPlayer` and `winningLines`. Prefer `const`; use `let` for reassigned state. Keep game logic inside the existing immediately invoked function. No formatter or linter is configured.

Preserve Korean copy, responsive layouts, accessible button labels, visible keyboard focus, and live status announcements. Cells intentionally remain focusable when marked `aria-disabled`; retain the JavaScript guard against invalid moves.

## Testing Guidelines

Use manual browser checks; there is no test framework or coverage threshold. Verify alternating turns, rejection of occupied cells, horizontal/vertical/diagonal wins, draws, a winning ninth move, and blocked moves after game completion. Confirm restart clears state and focuses the first cell. Check keyboard activation, narrow-screen layout, and browser-console errors. Describe checks actually performed in the pull request.

## Commit & Pull Request Guidelines

The sole existing commit is `Start isolated CLI demonstration`, so no established convention is evident. Use short, imperative commit subjects and keep changes focused. Pull requests should describe the behavior changed, list verification results, link relevant issues when available, and include screenshots for visual changes.
