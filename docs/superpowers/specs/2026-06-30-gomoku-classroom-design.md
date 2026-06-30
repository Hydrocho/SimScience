# Classroom Gomoku Design

## Goal

Add a classroom Gomoku activity where an approved teacher can temporarily allow students to create rooms and play Gomoku with friends. The feature should feel lightweight for a live class: no permanent room storage, no teacher-managed matchmaking, and no database migration for the first version.

## User Flow

Teachers enter the Gomoku page with the existing approved Google teacher account flow. A teacher can toggle "Gomoku allowed" on or off for the live lobby. While allowed, students in the Gomoku lobby can create rooms. When the teacher turns permission off, new room creation is disabled immediately, but existing rooms are not forced closed.

Students enter a nickname and join the Gomoku lobby. Open rooms appear in a live room list. A student can create a room or join an existing room from the list. In a room, the first joined participant becomes black, the second becomes white, and later participants become spectators.

The student who creates a room is the room owner. The room owner can start a new game after a win. If the owner leaves, the oldest remaining player becomes the owner; if no players remain, the oldest spectator becomes the owner.

## Game Rules

- 15x15 board.
- Black and white alternate turns.
- A move can only be placed on an empty intersection.
- The current player must match the active turn.
- Five or more continuous stones in any direction wins.
- Double-three is forbidden for both black and white.
- Undo is not supported.
- Time limits are not supported.
- After a win, no further moves are accepted until a new game starts.

Double-three means the move creates two or more independent open-three lines. The implementation should detect open-three patterns across horizontal, vertical, and both diagonal axes after the candidate stone is placed. A single open-three is legal; two or more open-threes reject the move.

## Architecture

The feature uses a new static page and two JavaScript modules:

- `gomoku.html`: teacher, student lobby, room list, room, board, and spectator UI.
- `js/gomoku-core.mjs`: pure Gomoku logic for board state, legal moves, win detection, double-three detection, and turn calculation.
- `js/gomoku-app.js`: DOM state and Supabase Realtime integration.
- `tests/gomoku-core.test.mjs`: pure logic tests for the core module.
- `index.html`: portal card linking to the Gomoku page.

The core module must not depend on Supabase or the DOM. This keeps rule tests fast and avoids browser setup for game logic verification.

## Realtime Design

The first version uses Supabase Realtime only. It does not create new database tables.

Channels:

- `gomoku_lobby`: teacher permission state, lobby presence, and live room summaries.
- `gomoku_room_<roomId>`: room presence, player role assignment, moves, game reset, and room status.

Lobby broadcasts:

- `permission-change`: teacher toggles whether students can create new rooms.
- `room-upsert`: a room owner or active room participant publishes a room summary.
- `room-remove`: a room is closed or expires from the lobby list.
- `teacher-heartbeat`: teacher periodically republishes the current permission state so late joiners receive it.
- `room-heartbeat`: active rooms periodically republish summaries so late joiners see the current room list.

Room broadcasts:

- `move-played`: a legal move was accepted and should be applied.
- `move-rejected`: optional local or remote feedback for an illegal move.
- `game-reset`: starts a new board in the same room.
- `player-disconnected`: informs participants that black or white disconnected.

Presence metadata should include `id`, `nickname`, `role`, `joinedAt`, and room-specific role when applicable: `black`, `white`, or `spectator`.

## State Model

Lobby state in the browser:

- `teacherAllowed`: whether room creation is currently enabled.
- `rooms`: map of room id to room summary.
- `myNickname`: current student nickname.
- `lastTeacherHeartbeatAt`: timestamp used to show whether teacher permission is currently fresh.

Room state in the browser:

- `roomId`
- `ownerId`
- `participants`
- `mySeat`: `black`, `white`, or `spectator`
- `board`
- `turn`
- `status`: `waiting`, `playing`, or `finished`
- `winner`: `black`, `white`, or `null`
- `lastMove`

Room summaries should show title, owner, black player, white player, spectator count, status, and last heartbeat time. The lobby removes room summaries that have not been refreshed recently.

## Error Handling

If teacher permission is off, the create-room button is disabled and any attempted room creation is blocked locally with a message.

If a student joins a room with a nickname already present in that room, the newer connection wins and the older duplicate session is kicked.

If a player disconnects during a game, the board remains visible. The opponent and spectators see a disconnected-player message. If a seat becomes empty, a later participant can fill it.

If a browser refreshes, the user is treated as a new realtime connection. This is acceptable for the temporary room model.

If a move is illegal because of turn mismatch, occupied cell, finished game, or double-three, the local UI rejects it and shows a short reason.

## UI Requirements

The page should follow the existing portal's light classroom style while keeping the game surface compact and clear. The first screen should be the usable Gomoku experience, not a marketing page.

Teacher view:

- Google teacher login or verified teacher status.
- Permission toggle.
- Live count of lobby students and rooms.

Student view:

- Nickname entry.
- Permission status.
- Room list.
- Create-room button.

Room view:

- 15x15 board.
- Black/white player labels.
- Spectator count.
- Current turn indicator.
- Move status and win message.
- New game control for the room owner or current players.

## Testing

Core tests should cover:

- Horizontal, vertical, and diagonal wins.
- Five or more stones counts as a win.
- Occupied intersections are rejected.
- Wrong-turn moves are rejected.
- Moves after a finished game are rejected.
- One open-three is allowed.
- Two or more open-threes are rejected as double-three.
- Turn advances after a legal move.

Manual browser verification should cover:

- Teacher toggles permission and student create-room state updates.
- Two students become black and white.
- Third student enters as spectator.
- Room list updates when rooms are created and statuses change.
- Moves sync across two browser sessions.
- Spectator board updates after each move.

## Non-Goals

- Persistent room history.
- Teacher approval of each individual room.
- Matchmaking queues.
- Undo or time controls.
- Full Renju rule enforcement beyond double-three.
- Chat.
