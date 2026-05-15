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
- Learning: The `site_announcements` table is new and requires a raw SQL migration. Only one announcement can be active (`is_active=1`) at a time; `activateSiteAnnouncement` deactivates all rows before setting the target. The bar is not dismissible — it stays visible until an admin deactivates it. All authenticated users (not just super-admins) can manage announcements via the Admin page.
- Action: Always provide the raw SQL for the user to run directly in Replit's database shell. Do NOT instruct `npm run db:push` — npm commands cannot be run on the Replit hosted app. See Evidence for the exact SQL.
- Evidence: `shared/schema.ts` siteAnnouncements table; SQL: `CREATE TABLE IF NOT EXISTS site_announcements (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), message TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info', is_active INTEGER NOT NULL DEFAULT 0, created_by_id VARCHAR, created_at TIMESTAMP DEFAULT NOW());`

## User role field — added to users table for in-app role management

- Date: 2026-05-15
- Trigger: Added user-level dropdown (Member / Admin / Super Admin) to the People section in Admin.
- Learning: The `users` table now has a `role` VARCHAR column (default `'member'`). The `requireSuperAdmin` middleware checks both the `SUPER_ADMIN_EMAILS` env var and the DB `role = 'super_admin'`, so super-admin can be granted via UI without redeployment. The `isSuperAdmin` flag in `/api/auth/user` also reflects the DB role.
- Action: When adding role-gated features, check both `isSuperAdmin` (env var path) and `user.role` (DB path). Always provide the raw SQL migration for Replit.
- Evidence: `shared/schema.ts` users table; `server/storage.ts` `updateUserRole`; `server/routes.ts` `PATCH /api/admin/users/:userId/role`; SQL: `ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'member';`

## Cog menu (scheduler.tsx) must be kept in sync with all reporting pages

- Date: 2026-05-15
- Trigger: Absence Reporting page was added but not linked from the cog dropdown until requested.
- Learning: The settings cog dropdown in `scheduler.tsx` is the primary navigation entry point for admin users. Every reporting page (`/reporting`, `/al-reporting`, `/absence-reporting`) must have a corresponding link in the Reporting section of that menu. The Reporting section is wrapped in `{isAdmin && (...)}` and is only shown to Admin/Super Admin users.
- Action: Whenever a new reporting page (or any admin-only page) is added, immediately add a corresponding `DropdownMenuItem` to the cog menu in `scheduler.tsx`. Also update `help-guide.tsx` admin tab to document the new entry.
- Evidence: `client/src/pages/scheduler.tsx` cog dropdown; `client/src/components/help-guide.tsx` admin tab.

## Replit deployment — npm commands cannot be run directly on the hosted app

- Date: 2026-05-15
- Trigger: User confirmed that `npm run db:push` cannot be executed on the Replit-hosted app.
- Learning: Never instruct the user to run npm/node commands to apply DB changes on Replit. Instead, provide the raw SQL `CREATE TABLE` / `ALTER TABLE` statements for the user to run directly in Replit's PostgreSQL database shell.
- Action: Whenever a schema change is made, output the exact SQL DDL statements needed alongside a note to run them in Replit's database tool.