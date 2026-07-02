# Gomoku Solo AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-available solo Gomoku mode with a local JavaScript AI, five difficulty levels, and temporary XP/level progress.

**Architecture:** Keep AI move selection and XP calculation in a pure `js/gomoku-ai.mjs` module tested with Node. Extend `gomoku.html` and `js/gomoku-app.js` so the existing board can run either multiplayer Realtime mode or solo local mode.

**Tech Stack:** Static HTML/CSS, browser JavaScript modules, existing Supabase Realtime for multiplayer only, Node `node:test`.

---

## Files

- Create `C:\MYCLAUDE_PROJECT\SimScience\tests\gomoku-ai.test.mjs`: AI and level tests.
- Create `C:\MYCLAUDE_PROJECT\SimScience\js\gomoku-ai.mjs`: local AI and progress logic.
- Modify `C:\MYCLAUDE_PROJECT\SimScience\gomoku.html`: add solo controls/progress UI.
- Modify `C:\MYCLAUDE_PROJECT\SimScience\js\gomoku-app.js`: integrate solo mode state and board handling.
- Create `C:\MYCLAUDE_PROJECT\SimScience\docs\superpowers\plans\2026-07-01-gomoku-solo-ai.md`: this implementation plan.

## Task 1: AI Module TDD

**Files:**
- Create: `tests/gomoku-ai.test.mjs`
- Create: `js/gomoku-ai.mjs`

- [ ] **Step 1: Write failing tests**

Add tests for immediate win, immediate block, legal move selection, double-three avoidance, XP reward, and level thresholds.

- [ ] **Step 2: Add minimal exported stubs**

Create `js/gomoku-ai.mjs` with exported constants and stub functions so the tests fail on behavior.

- [ ] **Step 3: Run RED**

Run: `node --test tests/gomoku-ai.test.mjs`
Expected: FAIL because stubs do not choose correct moves or calculate progress.

- [ ] **Step 4: Implement AI and progress logic**

Implement `chooseAiMove`, `getLegalMoves`, `scoreMove`, `calculateXpReward`, `calculateLevel`, and `applySoloResult`.

- [ ] **Step 5: Run GREEN**

Run: `node --test tests/gomoku-ai.test.mjs`
Expected: PASS.

## Task 2: Solo UI

**Files:**
- Modify: `gomoku.html`

- [ ] **Step 1: Add mode controls**

Add buttons for `친구와 하기` and `혼자 하기` in the student screen.

- [ ] **Step 2: Add solo panel**

Add difficulty buttons, start button, level/XP/win/loss/streak metrics, and solo status text.

- [ ] **Step 3: Add compact CSS**

Add segmented controls, selected difficulty state, solo metric layout, and mobile-safe spacing.

## Task 3: Solo App Integration

**Files:**
- Modify: `js/gomoku-app.js`

- [ ] **Step 1: Import AI module and add solo state**

Add state for student mode tab, selected difficulty, solo game, AI thinking, and temporary progress.

- [ ] **Step 2: Wire mode and difficulty controls**

Add event listeners for multiplayer/solo switching, difficulty selection, and solo game start.

- [ ] **Step 3: Route board clicks**

Update `handleCellClick` so solo mode applies the student's black move locally, then triggers the AI white move after a short delay.

- [ ] **Step 4: Update render functions**

Render board, room labels, status, reset button, and metrics correctly for solo and multiplayer modes.

- [ ] **Step 5: Award progress**

On solo win/loss/draw, update XP, level, wins, losses, and streak in memory.

## Task 4: Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run unit tests**

Run: `node --test tests/gomoku-ai.test.mjs tests/gomoku-core.test.mjs tests/lotto-core.test.mjs tests/debate-core.test.mjs`
Expected: PASS.

- [ ] **Step 2: Syntax check**

Run: `node --check js/gomoku-app.js`
Expected: no syntax errors.

- [ ] **Step 3: Browser smoke test**

Serve locally with `python -m http.server 8010 --bind 127.0.0.1`, open `http://127.0.0.1:8010/gomoku.html`, verify solo mode renders, starts a match, student move produces an AI move, and no console errors appear.

- [ ] **Step 4: Git review and commit**

Run: `git status --short`, stage only solo AI files, and commit with `Add solo gomoku AI mode`.
