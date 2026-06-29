# Lotto App Design

Date: 2026-06-29
Project: SimScience
Status: Approved for implementation planning

## Goal

Add a mobile-friendly real-time Lotto game to SimScience for classroom use. Students join with their phones, choose 6 numbers from 1 to 45, submit once, and wait while the teacher closes the round, draws winning numbers, and shows the ranking.

The app will be deployed as part of the existing GitHub Pages-based SimScience site and will reuse the current Supabase Realtime and teacher authentication patterns.

## Scope

In scope:

- Add `lotto.html` as a new SimScience game page.
- Add a game card for Lotto on `index.html`.
- Reuse Supabase URL, anon key pattern, Google OAuth teacher login, and `allowed_teachers` authorization.
- Reuse or lightly extend `js/network.js` for teacher/student Realtime rooms.
- Support QR and room-code student entry.
- Support one room with multiple independent rounds.
- Support manual close and timer-based automatic close.
- Support teacher-selected and random winning numbers.
- Include 6 winning numbers plus 1 bonus number.
- Show real Lotto-style rank plus matched count.
- Show full ranking on the teacher screen and each student's own result on the student screen.

Out of scope:

- Saving rooms, submissions, or results to Supabase database tables.
- Refresh/reconnect recovery beyond the current in-memory browser session.
- Student accounts or class rosters.
- Cumulative scoring across rounds.
- Money, purchase, gambling, or prize workflows.

## Architecture

The feature will be a static HTML/CSS/JavaScript page:

- `lotto.html`: Lotto app UI and game logic.
- `index.html`: portal card linking to `lotto.html`.
- `js/network.js`: existing Realtime room module reused for teacher/student communication.
- Existing Supabase constants: reuse the current project URL and anon key pattern already used by SimScience.

GitHub Pages will host the static files. Supabase will provide:

- Google OAuth session lookup for teachers.
- `allowed_teachers` table lookup for teacher authorization.
- Realtime Presence for connected student lists.
- Realtime Broadcast for round state, submissions, close signals, drawing, and results.

No new database tables are required for the first implementation.

## User Flow

Teacher flow:

1. Teacher opens SimScience portal.
2. Teacher clicks the Lotto game card.
3. Lotto first screen shows teacher login / room creation entry.
4. Teacher signs in with Google OAuth.
5. App checks that the teacher email exists in `allowed_teachers`.
6. Teacher creates a room.
7. Teacher screen displays a large QR code and large room code.
8. Students join and appear in the participant count.
9. Teacher starts or opens a round.
10. Students submit numbers.
11. Teacher manually closes the round, or the timer closes it.
12. Teacher chooses winning numbers manually or uses random draw.
13. App plays a short drawing animation.
14. Teacher sees full ranking.
15. Teacher starts the next round in the same room if desired.

Student flow:

1. Student scans QR or opens `lotto.html?room=123456`.
2. App opens directly to the student join screen.
3. Student enters name or nickname.
4. Student chooses 6 numbers from 1 to 45.
5. Submit button enables only after 6 numbers are selected.
6. Student submits once.
7. Submission locks and cannot be edited.
8. Student waits for results.
9. Student sees only their own result: rank, matched count, matched numbers, and bonus match state.

## Round State

The teacher browser is the source of truth for active round state.

States:

- `lobby`: room is open and students can connect.
- `selecting`: current round accepts student number submissions.
- `closed`: submissions are closed.
- `drawing`: winning numbers are being revealed.
- `results`: results are available.

Round state is not persisted to the database. A browser refresh can lose active round state; recovery is out of scope for the first implementation.

## Realtime Events

The implementation will reuse the existing `ClassroomNetwork` shape and add Lotto-specific payload fields where needed.

Event mapping:

- Presence sync: teacher receives current connected students.
- `settings-change`: sends Lotto round settings such as timer, round id, and state.
- `start-game`: starts a new Lotto round.
- `report-result`: student submits selected numbers to the teacher.
- `force-submit`: teacher closes the round; students with 6 selected numbers auto-submit, students with fewer than 6 are treated as unsubmitted.
- `ranking-update`: teacher sends result payload after drawing.
- `round-reset`: teacher starts the next round and returns students to selection.

To reduce accidental coupling with other games, every Lotto payload will include `game: "lotto"` and `roundId`. If `js/network.js` is extended, Lotto-specific helper methods will still send through the existing event pattern.

## Game Rules

Student selection:

- Students select exactly 6 unique numbers from 1 to 45.
- Students choose manually; there is no student random-fill feature in the approved scope.
- Once submitted, the selection is locked.

Winning numbers:

- Teacher sets 6 winning numbers plus 1 bonus number.
- Teacher can manually select numbers or use a random draw button.
- Bonus number cannot duplicate any winning number.

Ranking:

- 1st: 6 winning numbers matched.
- 2nd: 5 winning numbers matched plus bonus matched.
- 3rd: 5 winning numbers matched.
- 4th: 4 winning numbers matched.
- 5th: 3 winning numbers matched.
- No prize: 0 to 2 winning numbers matched.

Teacher ranking will show rank, matched count, selected numbers, matched numbers, and bonus status. Student result will show only that student's own outcome.

## Timer Behavior

Teacher can set a timer using presets plus direct input.

When the timer ends:

- Students with exactly 6 selected numbers are automatically submitted.
- Students with fewer than 6 selected numbers are marked unsubmitted.
- Teacher can still manually close before the timer ends.

The teacher screen will show participant count, submitted count, unsubmitted count, and remaining time.

## UI Direction

Visual style:

- Classic Lotto: yellow/orange palette, numbered balls, and short drawing-machine style animation.
- Text uses Lotto terms directly: Lotto, winning numbers, draw, prize rank, first place.
- No money, purchase, gambling, or prize redemption language.

Student mobile layout:

- 5 columns by 9 rows for numbers 1 to 45.
- Large tap targets for phone use.
- Selected numbers appear as fixed number balls near the top.
- Submit button remains disabled until 6 numbers are selected.
- Student phones remain silent.

Teacher layout:

- Large QR code and large room code for projection.
- Clear participant/submission/timer status.
- Manual close and timer close controls.
- Manual winning-number selector and random draw control.
- Short 5 to 8 second drawing animation.
- Teacher-only sound effects for selection, submission milestones, and drawing reveal.

QR generation:

- Generate QR in the browser using a JavaScript library.
- Do not depend on an external QR image API.

## Error Handling

- If Supabase is unavailable, show a clear connection error and disable room creation/joining.
- If a teacher is not signed in, show Google login.
- If a signed-in email is not in `allowed_teachers`, block teacher room creation and sign out or return to the start screen.
- If a student joins with a duplicate nickname, reuse the existing network duplicate handling pattern or show a clear duplicate-name message.
- If a student tries to submit fewer or more than 6 numbers, block submission.
- If Realtime disconnects, show a reconnecting state and avoid accepting duplicate submissions.

## Testing Plan

Manual browser verification will cover:

- Portal card opens `lotto.html`.
- Teacher login succeeds for an allowed teacher.
- Teacher login is blocked for a non-allowed teacher.
- Room creation displays large QR and room code.
- `lotto.html?room=123456` opens directly to student join.
- Student name join appears in teacher participant count.
- Student can select exactly 6 numbers on mobile layout.
- Submit locks the student's selection.
- Teacher sees submitted count update.
- Manual close prevents further submissions.
- Timer close auto-submits students with 6 selected numbers and marks incomplete students unsubmitted.
- Teacher manual winning number selection validates uniqueness.
- Random draw creates 6 unique winning numbers plus 1 unique bonus number.
- Drawing animation reveals numbers in 5 to 8 seconds.
- Rank calculation matches the approved Lotto rules.
- Teacher sees full ranking.
- Student sees only their own result.
- Next round resets student screens without cumulative scoring.

## Implementation Notes

- Keep the first implementation static and dependency-light.
- Prefer existing SimScience UI conventions where they do not conflict with the Classic Lotto direction.
- Keep Lotto-specific state isolated in `lotto.html` or a small Lotto module if splitting becomes cleaner.
- Avoid adding Supabase database tables unless a later requirement adds persistence or history.
