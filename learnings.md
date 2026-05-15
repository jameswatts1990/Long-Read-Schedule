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

## Admin page — section-based navigation via URL param

- Date: 2026-05-12
- Trigger: Refactored admin page from single stacked layout to section-based navigation.
- Learning: The admin page now uses a `?section=` URL param (initialised via `window.location.search` in useState, updated via `history.replaceState`) to show one section at a time. The scheduler cog dropdown links directly to `/admin?section=people` etc. Do not revert to stacked layout.
- Action: When linking to a specific admin section, use `/admin?section=people`, `/admin?section=tasks`, `/admin?section=rota`, `/admin?section=workspaces`.
- Evidence: `client/src/pages/admin.tsx` `activeSection` state + `handleSectionChange`; `client/src/pages/scheduler.tsx` cog dropdown.

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
- Action: Grep for `Math.round` near week/day calculations before any rota-related change. Also ensure `getMondayOf` uses UTC methods (`setUTCHours`, `getUTCDay`, `setUTCDate`) — using local-time equivalents gives wrong results for non-UTC timezones.
- Evidence: Fixed in `client/src/pages/admin.tsx` `getRotationPreview` (was using local time + Math.round; now uses UTC + Math.floor to match server logic)

## Rota applyRotaMutation missing onError — silent failures hide scheduling problems

- Date: 2026-05-15
- Trigger: User reported still unable to see rota assignments after the ZodError fix. Code review found `applyRotaMutation` in `scheduler.tsx` had no `onError` handler.
- Learning: When `POST /api/rota-tasks/apply` fails (any reason), TanStack Query silently discards the error if no `onError` is defined. The user sees no toast and no assignments, with zero feedback.
- Action: All useMutation calls that modify data the user expects to see must have an `onError` handler. Auto-triggered mutations (fired from useEffect) are especially easy to miss because there's no explicit user action to associate the failure with.
- Evidence: `client/src/pages/scheduler.tsx` `applyRotaMutation`; fixed by adding `onError` toast.

## Rota startDate default uses UTC — wrong person assigned for BST users near midnight

- Date: 2026-05-15
- Trigger: `startDate` form default used `new Date().toISOString().slice(0, 10)` (UTC date). For UK users in BST (+1), this yields yesterday's date during the 00:00–01:00 UTC window, making the server calculate `weeksSinceStart = 1` on the first active week, skipping person #1 and assigning person #2 instead.
- Learning: Any date input defaulting to "today" must use local calendar date methods (`getFullYear`, `getMonth`, `getDate`), not `toISOString()` which is UTC.
- Action: Use `\`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}\`` pattern instead of `toISOString().slice(0,10)`.
- Evidence: `client/src/pages/admin.tsx` form `defaultValues.startDate` and reset on "Add" button click.

## Rota error messages — server catch blocks must distinguish ZodError from other errors

- Date: 2026-05-11
- Trigger: User reported "Failed to create rota task" with no additional context. The server catch block was returning a generic message for ALL errors, hiding the real Zod validation failure reason.
- Learning: Always differentiate `ZodError` (return 400 + `error.errors[0]?.message`) from unexpected errors (return 500) in route catch blocks. Also ensure client `onError` callbacks read the `error` argument rather than ignoring it.
- Action: When adding a new API route, use the pattern: `if (error instanceof ZodError) { res.status(400).json({ message: error.errors[0]?.message ?? "..." }); } else { res.status(500).json({ message: "..." }); }`. On the client, use `extractErrorMessage(error)` as the toast `description`.
- Evidence: `server/routes.ts` POST/PUT /api/rota-tasks; `client/src/pages/admin.tsx` mutation onError callbacks

## Sitewide announcement bar — new DB table requires migration

- Date: 2026-05-15
- Trigger: Added sitewide notification bar feature (Admin → Announcements section).
- Learning: The `site_announcements` table is new and requires a DB migration before the app can use the feature. Only one announcement can be active (`is_active=1`) at a time; `activateSiteAnnouncement` deactivates all rows before setting the target. Dismissal is per-user per-browser via localStorage key `dismissed_announcements` (array of IDs) — no DB needed for dismiss state.
- Action: Alert the user to run `npm run db:push` via Replit before testing. The feature is gated to super-admins on the Admin page (same as Workspaces section).
- Evidence: `shared/schema.ts` siteAnnouncements table; `client/src/components/site-announcement-bar.tsx`; `server/routes.ts` /api/site-announcements routes