# learnings.md

## How to use this file

This file stores durable project-specific lessons for Claude Code.

Claude must read this file in full before starting work and again before commit.

Add entries only when the lesson is likely to help with future tasks. Keep entries short, concrete, and action-oriented.

---

## Entry template

## [Short title]

- Date: YYYY-MM-DD
- Trigger: What happened?
- Learning: What should be remembered next time?
- Action: What Claude should do differently in future
- Evidence: Optional command, file path, error message, PR note, or reviewer feedback

---

## Current learnings

## Recurring assignments — seriesId migration required after schema change

- Date: 2026-05-11
- Trigger: Added `seriesId` column to `assignments` table in `shared/schema.ts`
- Learning: This requires a database migration. The column is nullable so existing rows are unaffected, but Drizzle ORM won't add it automatically — it must be deployed via Replit's migration tooling before the server can read/write `seriesId`.
- Action: Always alert the user to run migrations via Replit before testing any schema change.
- Evidence: `shared/schema.ts` assignments table, `ALTER TABLE assignments ADD COLUMN series_id varchar;`

## Recurring assignment bugs — Promise.all and safety counter

- Date: 2026-05-11
- Trigger: Code review of `add-assignment-dialog.tsx` revealed two silent failure modes in `generateRepeatDates` and the chunked creation loop.
- Learning: (1) `Promise.all` in chunked creation means a single HTTP failure cancels reporting for the whole chunk even if earlier chunks already succeeded — always use `Promise.allSettled` for partial-success scenarios. (2) The safety iteration counter must be separate from the occurrence count; conflating them silently truncates long daily series.
- Action: Use `Promise.allSettled` whenever creating assignments in loops. Keep iteration counters and business-logic counters separate.

## Rota week calculation uses Math.round — should be Math.floor

- Date: 2026-05-11
- Trigger: Code review of `storage.ts` `applyRotaTasksForWeek`. DST transitions make some weeks 167h or 169h, causing `Math.round` to advance the week index prematurely and assign the wrong person.
- Learning: Always use `Math.floor` when converting milliseconds to integer weeks. UTC Monday normalisation (`getMondayOf`) already handles the DST-boundary alignment.
- Action: Grep for `Math.round` near week/day calculations before any rota-related change.
- Evidence: `server/storage.ts` line 632