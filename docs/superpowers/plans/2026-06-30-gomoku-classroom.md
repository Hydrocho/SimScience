# Classroom Gomoku Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a teacher-gated classroom Gomoku page where students can create temporary rooms, play with two players, and allow spectators.

**Architecture:** Keep Gomoku rules in a pure `js/gomoku-core.mjs` module and test them with Node's built-in test runner. Build `gomoku.html` and `js/gomoku-app.js` as a static browser app that uses Supabase Realtime broadcast and presence without new database tables.

**Tech Stack:** Static HTML/CSS, browser JavaScript modules, Supabase JS CDN v2, existing `js/supabase.js`, Node `node:test`.

---

## Files

- Create `C:\MYCLAUDE_PROJECT\SimScience\tests\gomoku-core.test.mjs`: pure logic tests.
- Create `C:\MYCLAUDE_PROJECT\SimScience\js\gomoku-core.mjs`: board, move validation, win, double-three, room helpers.
- Create `C:\MYCLAUDE_PROJECT\SimScience\js\gomoku-app.js`: DOM and Supabase Realtime app.
- Create `C:\MYCLAUDE_PROJECT\SimScience\gomoku.html`: teacher/student UI and board.
- Modify `C:\MYCLAUDE_PROJECT\SimScience\index.html`: add Gomoku portal card and styles.

## Task 1: Gomoku Core Tests

**Files:**
- Create: `tests/gomoku-core.test.mjs`
- Create: `js/gomoku-core.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/gomoku-core.test.mjs` with tests for board creation, legal moves, occupied cells, wrong turn, wins, double-three, and room id generation.

- [ ] **Step 2: Add empty module exports**

Create `js/gomoku-core.mjs` with exported function stubs so tests fail on behavior, not missing imports.

- [ ] **Step 3: Run RED**

Run: `node --test tests/gomoku-core.test.mjs`
Expected: FAIL because stubbed functions do not return valid board and move results.

## Task 2: Gomoku Core Implementation

**Files:**
- Modify: `js/gomoku-core.mjs`
- Test: `tests/gomoku-core.test.mjs`

- [ ] **Step 1: Implement board and move validation**

Implement constants, `createBoard`, `cloneBoard`, `getCell`, `isInBounds`, and `applyMove` with occupied-cell, turn, and finished-game checks.

- [ ] **Step 2: Implement win detection**

Implement four-axis line counting so five or more continuous stones wins.

- [ ] **Step 3: Implement double-three detection**

Implement open-three counting by scanning each axis around the candidate move and rejecting two or more open-three lines for both colors.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/gomoku-core.test.mjs`
Expected: PASS.

## Task 3: Gomoku Static UI

**Files:**
- Create: `gomoku.html`

- [ ] **Step 1: Create page structure**

Add a static page with top status, teacher panel, student lobby panel, room list, board panel, and reusable Korean UI text.

- [ ] **Step 2: Add responsive CSS**

Use a restrained light classroom UI, stable 15x15 board sizing, compact controls, and no nested cards.

- [ ] **Step 3: Load modules**

Include Supabase CDN and `<script type="module" src="./js/gomoku-app.js"></script>`.

## Task 4: Realtime App

**Files:**
- Create: `js/gomoku-app.js`
- Modify: `gomoku.html` only if IDs need alignment.

- [ ] **Step 1: Implement teacher auth and permission**

Use `checkIsTeacherAllowed`, `supabaseClient.auth.getSession`, Google OAuth login, and a `gomoku_lobby` Realtime channel. Broadcast `permission-change` and periodic `teacher-heartbeat`.

- [ ] **Step 2: Implement student lobby**

Let students enter a nickname, join `gomoku_lobby`, receive permission state, create rooms only while allowed, and render room summaries from `room-upsert` plus `room-heartbeat`.

- [ ] **Step 3: Implement room joining**

Use a `gomoku_room_<roomId>` channel. Assign black, white, and spectator seats from presence sorted by `joinedAt`. Deduplicate same nickname by preferring newer joins.

- [ ] **Step 4: Implement move sync**

Validate local moves with `applyMove`. Broadcast accepted moves as `move-played`; apply remote moves if legal and not already applied. Show illegal move messages locally.

- [ ] **Step 5: Implement reset and disconnect states**

Allow players or owner to start a new game after a win. Show disconnected player state when seats become empty.

## Task 5: Portal Integration

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Gomoku card styles**

Add `.portal-card.gomoku-game` highlight and icon badge colors.

- [ ] **Step 2: Add portal card**

Add a card linking to `gomoku.html` with tags for teacher permission, room list, and spectator mode.

## Task 6: Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run unit tests**

Run: `node --test tests/gomoku-core.test.mjs tests/lotto-core.test.mjs tests/debate-core.test.mjs`
Expected: PASS.

- [ ] **Step 2: Start local server**

Run: `python -m http.server 8000`
Expected: serves `http://localhost:8000/`.

- [ ] **Step 3: Browser smoke test**

Open `http://localhost:8000/gomoku.html`, verify the page renders, board has 225 cells, student nickname flow works locally, and no console syntax errors appear.

- [ ] **Step 4: Git status review**

Run: `git status --short`
Expected: only Gomoku feature files and `index.html` are modified or added, plus any pre-existing unrelated untracked files.
