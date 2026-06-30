# Gemini Debate Design

## Goal

Add a teacher-controlled classroom debate activity about whether development should be limited to respond to global warming.

## Architecture

The static frontend uses the existing Supabase Realtime `ClassroomNetwork` pattern for classroom presence and live teacher monitoring. Gemini calls go through a Supabase Edge Function, so the Gemini API key stays server-side and the server checks whether the teacher has opened the room before spending tokens.

## Flow

Teachers sign in with Google, create a six-digit room, and use an open/close button to control AI chat availability. Students join by QR/PIN and nickname. Student messages are sent to the Edge Function only when the room is open. The function stores student and AI messages, calls Gemini, and returns the AI response. The student broadcasts the exchange to the teacher monitor after the response arrives.

## Security

The Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` environment variables. Teacher actions require a valid Supabase session and an email listed in `allowed_teachers`. Student AI requests require only a valid room PIN and an open room, but the function enforces message length and stores messages with the room id.

## Files

- `debate.html`: teacher/student UI.
- `js/debate-core.mjs`: prompt and validation helpers.
- `js/debate-app.js`: frontend classroom flow.
- `supabase/functions/gemini-debate/index.ts`: server-side Gemini proxy and room actions.
- `supabase/migrations/202606300001_gemini_debate.sql`: room and message tables.
- `tests/debate-core.test.mjs`: pure logic tests.
