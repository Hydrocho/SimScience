# Gemini Debate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a teacher-controlled Gemini debate activity for the global warming development-limit topic.

**Architecture:** A static classroom UI uses the existing Supabase Realtime network for presence and monitoring. A Supabase Edge Function owns room creation, open/close state, message storage, teacher authorization, and Gemini API calls.

**Tech Stack:** Static HTML/CSS/ES modules, Supabase Realtime/Auth/Edge Functions, Gemini REST API, Node test runner.

---

### Task 1: Core Debate Logic

**Files:**
- Create: `js/debate-core.mjs`
- Test: `tests/debate-core.test.mjs`

- [x] Write failing tests for message validation, history normalization, prompt content, and room ids.
- [x] Run `node --test tests/debate-core.test.mjs` and verify it fails because `js/debate-core.mjs` does not exist.
- [x] Implement the minimal pure helpers.
- [x] Run `node --test tests/debate-core.test.mjs` and verify it passes.

### Task 2: Classroom UI

**Files:**
- Create: `debate.html`
- Create: `js/debate-app.js`
- Modify: `index.html`

- [x] Add teacher/student start screens, QR/PIN display, chat open/close controls, student chat, and teacher monitor.
- [x] Reuse `ClassroomNetwork` for student presence, teacher state sync, and student exchange reports.
- [x] Add a portal card linking to `debate.html`.

### Task 3: Supabase Server Boundary

**Files:**
- Create: `supabase/migrations/202606300001_gemini_debate.sql`
- Create: `supabase/functions/gemini-debate/index.ts`
- Create: `supabase/functions/gemini-debate/deno.json`

- [x] Add `debate_rooms` and `debate_messages` tables with RLS enabled and read-only public policies.
- [x] Implement Edge Function actions: `create_room`, `set_room_open`, and `ask`.
- [x] Keep Gemini API key server-side through `GEMINI_API_KEY`.
- [x] Require allowed teacher authentication for teacher actions.
- [x] Check `debate_rooms.is_open` before every Gemini call.

### Task 4: Verification

**Files:**
- Test: `tests/*.mjs`
- Check: `js/debate-app.js`
- Check: `js/debate-core.mjs`

- [x] Run `node --test tests/*.mjs`.
- [x] Run `node --check js/debate-app.js`.
- [x] Run `node --check js/debate-core.mjs`.
- [ ] Run `deno check supabase/functions/gemini-debate/index.ts` in an environment with Deno.
- [ ] Deploy the migration and function to Supabase, then set `GEMINI_API_KEY`.
