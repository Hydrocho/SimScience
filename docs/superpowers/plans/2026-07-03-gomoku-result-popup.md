# Gomoku Result Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small centered result popup when a gomoku game ends, for both solo AI and multiplayer games.

**Architecture:** Keep winner-to-message logic in a small tested module, then connect the DOM popup to the existing `renderRoomInfo()` and solo finish flow. The popup is hidden on mode changes, new games, room resets, and manual close.

**Tech Stack:** Vanilla HTML/CSS/JavaScript modules, Node test runner.

---

### Task 1: Result Message Helper

**Files:**
- Create: `js/gomoku-result.mjs`
- Test: `tests/gomoku-result.test.mjs`

- [ ] Add failing tests for solo win/loss and multiplayer self/opponent/spectator messages.
- [ ] Run `node --test tests/gomoku-result.test.mjs` and confirm it fails because the module is missing.
- [ ] Implement `getResultPopupMessage({ winner, mySeat, playMode })`.
- [ ] Re-run the new test and confirm it passes.

### Task 2: Popup UI

**Files:**
- Modify: `gomoku.html`
- Modify: `js/gomoku-app.js`

- [ ] Add a centered hidden popup with `#result-popup`, `#result-popup-title`, and `#result-popup-close`.
- [ ] Add styling that keeps the popup small and centered without blocking board layout.
- [ ] Import the helper in `js/gomoku-app.js`.
- [ ] Add `showResultPopup()`, `hideResultPopup()`, and `syncResultPopup()` functions.
- [ ] Call `syncResultPopup()` when room info renders after game end.
- [ ] Call `hideResultPopup()` when starting/resetting/changing games.

### Task 3: Verification

**Files:**
- Test: `tests/gomoku-result.test.mjs`
- Test: existing gomoku tests

- [ ] Run `node --check js/gomoku-app.js`.
- [ ] Run `node --test tests/gomoku-result.test.mjs tests/gomoku-ai.test.mjs tests/gomoku-core.test.mjs tests/lotto-core.test.mjs tests/debate-core.test.mjs`.
- [ ] Browser-check solo AI: force a finished game or play until result, verify popup appears with `승리`/`패배`.
- [ ] Browser-check multiplayer helper behavior through tests and ensure no console errors on page load.
