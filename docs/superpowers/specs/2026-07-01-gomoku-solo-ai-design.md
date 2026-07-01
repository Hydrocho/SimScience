# Gomoku Solo AI Design

## Goal

Add an offline solo mode to the existing classroom Gomoku page so students can play against a JavaScript AI without any external API. The mode should include five AI difficulty levels and an in-session level system that students can use for lightweight self-challenge and bragging during class.

## Scope

Solo mode is added inside the existing `gomoku.html` page. Multiplayer remains teacher-gated, but solo mode is always available. Solo progress is temporary and resets when the page reloads or the browser tab closes.

This feature does not add database tables, Supabase functions, persistent accounts, or external AI calls.

## User Flow

Students open the Gomoku page and choose between `친구와 하기` and `혼자 하기`. In solo mode, the student enters or reuses a nickname, chooses one of five AI levels, and starts a match.

The student plays black and the local AI plays white. After the student places a legal move, the AI waits briefly and then places its move. The game uses the same 15x15 board and the same rule engine as multiplayer:

- five or more continuous stones wins;
- occupied cells are illegal;
- moves after game end are illegal;
- double-three is forbidden for both sides.

After a win or loss, the student can start another solo match. Wins grant experience based on difficulty. Losses do not remove experience.

## AI Difficulty

The AI is deterministic enough to feel fair but uses limited randomness so repeated games do not feel identical.

- `입문`: mostly random legal moves, with a light preference for cells near existing stones.
- `쉬움`: prefers simple attack or defense when it sees short lines.
- `보통`: always takes an immediate winning move and blocks the student's immediate winning move.
- `어려움`: scores candidate moves using attack strength, defense strength, open-threes, four-in-a-row threats, and center preference.
- `도전`: uses the same scoring as `어려움`, with stronger defensive weighting and a wider candidate set. It must avoid illegal double-three moves.

The AI should never place an illegal move. If no legal candidates exist, the game is treated as a draw.

## Level System

Progress is stored only in browser memory for the current page session.

State:

- `nickname`
- `level`
- `xp`
- `wins`
- `losses`
- `currentStreak`
- `bestStreak`
- `lastDifficulty`

Experience rewards:

- `입문`: 5 XP
- `쉬움`: 10 XP
- `보통`: 25 XP
- `어려움`: 45 XP
- `도전`: 75 XP
- streak bonus: `currentStreak * 3` XP after a win

Level calculation should be simple and visible. The first version uses cumulative thresholds:

- Level 1: 0 XP
- Level 2: 30 XP
- Level 3: 80 XP
- Level 4: 150 XP
- Level 5: 250 XP
- After level 5, each additional level requires 150 more XP than the previous threshold.

## Architecture

New module:

- `js/gomoku-ai.mjs`
  - exports AI difficulty constants;
  - selects legal AI moves using the existing `gomoku-core.mjs` functions;
  - scores candidate moves;
  - calculates XP rewards and level state.

Modified files:

- `gomoku.html`
  - adds mode controls for `친구와 하기` and `혼자 하기`;
  - adds solo setup and progress panels;
  - reuses the existing board area.
- `js/gomoku-app.js`
  - adds solo app state;
  - switches board behavior between multiplayer and solo mode;
  - applies student moves, triggers AI moves, and updates progress after game end.
- `tests/gomoku-ai.test.mjs`
  - covers AI move selection and level calculation.

Existing module reuse:

- `js/gomoku-core.mjs` remains the single source of truth for board state, legal moves, win detection, and double-three validation.

## Error Handling

If the student has not entered a nickname, solo start is blocked with a short message.

If the AI has no legal moves, the match ends in a draw and no XP is awarded.

If the student tries to move while the AI is thinking, the click is ignored and a status message explains that it is the AI turn.

If the student changes difficulty during an active match, the change applies to the next match only.

Switching from solo mode to multiplayer during an active solo match pauses local solo state visually by leaving the current board in memory, but multiplayer actions do not affect solo XP. Returning to solo mode shows the current solo match unless the student starts a new one.

## UI Requirements

The solo UI should fit the current page style and stay compact:

- segmented control for `친구와 하기` / `혼자 하기`;
- difficulty buttons or select control for five AI levels;
- visible level, XP, wins, losses, current streak, and best streak;
- short status text for AI thinking, win/loss/draw, illegal move, and XP gained;
- no external images or decorative landing page.

The board must remain stable on desktop and mobile. Text must not overlap compact controls.

## Testing

Core AI tests should verify:

- AI chooses an immediate winning move when available.
- AI blocks the student's immediate winning move at `보통` or higher.
- AI only returns legal moves.
- AI avoids double-three moves.
- Difficulty scoring gives stronger candidates priority at higher levels.
- XP reward uses difficulty plus streak bonus.
- Level calculation follows the cumulative thresholds.

Browser verification should cover:

- switching between multiplayer and solo mode;
- starting a solo match;
- student move followed by AI move;
- win updates XP and level;
- loss updates losses and resets streak;
- mobile layout remains usable.

## Non-Goals

- Persistent ranking or account-based records.
- Supabase storage for solo progress.
- External AI API calls.
- Perfect professional-strength Gomoku engine.
- Multiplayer rooms with AI participants.
