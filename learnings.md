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
- Learning: The `site_announcements` table is new and requires a raw SQL migration. Only one announcement can be active (`is_active=1`) at a time; `activateSiteAnnouncement` deactivates all rows before setting the target. The bar is dismissable — clicking × stores the dismissal in `localStorage` (keyed `dismissed_announcement`, with `announcementId` + `dismissedAt`). It reappears after 24 hours or if the active announcement changes to a different ID. All authenticated users (not just super-admins) can manage announcements via the Admin page.
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

## Admin cog menu must be kept in sync with all admin sections

- Date: 2026-05-15
- Trigger: Announcements section existed in admin.tsx but was not linked from the cog dropdown.
- Learning: The cog dropdown in `scheduler.tsx` is the primary navigation entry point. Every section in the Admin `<Select>` (`people`, `tasks`, `rota`, `announcements`, and `workspaces` for super admins) must have a matching `DropdownMenuItem` under the Admin label in the cog menu. Workspaces is gated with `user.role === 'super_admin' || user.isSuperAdmin`.
- Action: Whenever a new section is added to admin.tsx, immediately add a corresponding link to the Admin section of the cog dropdown in `scheduler.tsx`.
- Evidence: `client/src/pages/scheduler.tsx` cog dropdown; `client/src/pages/admin.tsx` `<Select>` options.

## Slack notifications — slackEnabled gate and new DB columns

- Date: 2026-05-15
- Trigger: Added Slack DM reminders for assignments (per-assignment toggle, 9 AM Mon–Fri cron).
- Learning: (1) `slackEnabled` is exposed via `/api/auth/user` as `!!process.env.SLACK_BOT_TOKEN` — all UI elements that reference Slack must guard on this flag so they're invisible when Slack is not configured. (2) The Slack Bot token must have `chat:write` scope; posting to a user's DM uses their Slack Member ID as the `channel` parameter. (3) node-cron runs in-process, started once via `startCron()` in `server/index.ts` after routes mount. (4) `people.slack_user_id` is per-workspace person row, not on the `users` table, because assignments link to people not users.
- Action: When extending Slack features, guard all UI with `slackEnabled`; the cron uses `getTodaysSlackAssignments()` which computes today's weekStartDate (UTC Monday) and day name. New packages (`@slack/web-api`, `node-cron`, `@types/node-cron`) were added to package.json — Replit must run `npm install` to pick them up.
- Evidence: `server/slack.ts`, `server/cron.ts`; SQL migration: `ALTER TABLE people ADD COLUMN slack_user_id VARCHAR; ALTER TABLE assignments ADD COLUMN slack_notify INTEGER NOT NULL DEFAULT 0;`

## Replit deployment — npm commands cannot be run directly on the hosted app

- Date: 2026-05-15
- Trigger: User confirmed that `npm run db:push` cannot be executed on the Replit-hosted app.
- Learning: Never instruct the user to run npm/node commands to apply DB changes on Replit. Instead, provide the raw SQL `CREATE TABLE` / `ALTER TABLE` statements for the user to run directly in Replit's PostgreSQL database shell.
- Action: Whenever a schema change is made, output the exact SQL DDL statements needed alongside a note to run them in Replit's database tool.

## rota_skips table — missing migration silently breaks all rota assignments

- Date: 2026-05-18
- Trigger: Users reported rota task assignments never appearing despite rota tasks being created successfully. The `applyRotaTasksForWeek` function opens with a SELECT against `rota_skips`; if that table doesn't exist the function throws immediately and no assignments are created.
- Learning: The `rota_skips` table and `assignments_rota_slot_unique` partial unique index must be present in the DB for rota assignment creation to work. The CREATE/apply failure was invisible because (a) the catch block had no `console.error`, and (b) it returned 400 for all errors including DB errors.
- Action: Always provide the SQL below when rota features are deployed. Also: always add `console.error(error)` to every route catch block so DB failures leave a server-side trace.
- Evidence: `server/storage.ts` `applyRotaTasksForWeek`; SQL migrations required:
  ```sql
  CREATE TABLE IF NOT EXISTS rota_skips (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    rota_task_id VARCHAR NOT NULL,
    week_start_date TEXT NOT NULL,
    day TEXT NOT NULL,
    workspace_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS rota_skips_unique
    ON rota_skips (rota_task_id, week_start_date, day);
  CREATE UNIQUE INDEX IF NOT EXISTS assignments_rota_slot_unique
    ON assignments (rota_task_id, week_start_date, day)
    WHERE rota_task_id IS NOT NULL;
  ```

## Slack Events API — inbound bot messages for week schedule

- Date: 2026-05-18
- Trigger: Added feature for users to DM the bot and receive their week schedule.
- Learning: (1) Requires `SLACK_SIGNING_SECRET` env var (from Slack app Basic Information page) and Event Subscriptions enabled in the Slack app with `message.im` bot event subscribed. (2) The `/slack/events` route is unauthenticated — it validates Slack's HMAC-SHA256 request signature instead. (3) Always respond with 200 immediately (before async work) so Slack doesn't retry within its 3-second window. (4) Filter out `event.bot_id` and `event.subtype` to avoid infinite loops from the bot's own messages.
- Action: If extending Slack bot interactions, add the new event type subscription in the Slack app dashboard and re-verify the URL. The `im:history` bot scope must be present for `message.im` events to fire.
- Evidence: `server/slack.ts` (verifySlackSignature, formatWeekScheduleMessage); `server/routes.ts` POST /slack/events; `server/storage.ts` getWeekAssignmentsForSlackUserId, isSlackUserIdRegistered.

## Slack expanded — command parsing, change notifications, Friday preview cron

- Date: 2026-05-19
- Trigger: Extended Slack integration with three new features.
- Learning: (1) `getOffsetMondayUTC(n)` generalises `getMondayUTC()` — pass +1 for next week. Keep `getMondayUTC()` as a thin wrapper so existing callers don't break. (2) Assignment change DMs are gated by a new `slackChangeNotify` DB column (INTEGER NOT NULL DEFAULT 0) — requires migration: `ALTER TABLE assignments ADD COLUMN slack_change_notify INTEGER NOT NULL DEFAULT 0;`. (3) The Friday 8 AM preview cron uses `getPeopleWithSlackIdsForWeek` which queries `assignments JOIN people WHERE weekStartDate = nextMonday AND slack_user_id IS NOT NULL` — returns distinct Slack IDs. (4) DM sends after delete must happen after `deleteAssignment()` returns, never before. (5) Command parsing uses `event.text.toLowerCase().includes(...)` — simple and reliable; check "next week" before "this week"/"week" so the longer string matches first. (6) All Slack cron jobs fire at 08:00 UTC.
- Action: When adding more bot commands, extend the if/else chain in the `/slack/events` handler in `routes.ts`. When adding assignment DMs, always fire-and-forget (`.catch(...)`) so a Slack failure doesn't break the HTTP response.
- Evidence: `server/slack.ts` (getOffsetMondayUTC, getTodayInfo, formatDayScheduleMessage, buildAppHomeBlocks, publishAppHome); `server/cron.ts` (Friday 8 AM cron); `server/storage.ts` (getPeopleWithSlackIdsForWeek); `server/routes.ts` (Events handler, POST/DELETE /api/assignments); `shared/schema.ts` (slackChangeNotify column).

## drizzle-zod omits integer-with-default columns — explicit schema overrides required

- Date: 2026-05-19
- Trigger: `slackChangeNotify` (and `slackNotify`) checkbox values were not persisted on create. `customColor` had the same issue and was worked around by extracting it from `req.body` before the schema parse.
- Learning: `createInsertSchema(assignments)` from drizzle-zod silently omits some `integer().notNull().default(n)` columns from the generated Zod schema. Calling `.parse()` strips any field not in the schema, so the DB INSERT falls back to `DEFAULT 0` even when the user explicitly set the value.
- Action: When adding a new `integer().notNull().default(...)` column that must round-trip through `insertAssignmentSchema.parse()`, add an explicit override in the `.extend()` call in `shared/schema.ts` (e.g. `slackChangeNotify: z.number().int().min(0).max(1).optional()`). This ensures the field survives the parse on both client and server. Do NOT rely solely on drizzle-zod's auto-generation for these columns.
- Evidence: `shared/schema.ts` `insertAssignmentSchema.extend()`; same pattern already used for `slackNotify` and `slackChangeNotify` after this fix.

## Slack App Home tab — requires Slack dashboard config + app_home_opened event

- Date: 2026-05-19
- Trigger: Added Slack App Home tab showing the user's current week schedule.
- Learning: (1) App Home requires two Slack dashboard changes: enable "Home Tab" under App Home, and subscribe to `app_home_opened` in Event Subscriptions. (2) The event fires with `event.type === "app_home_opened"` and `event.tab === "home"` — must be handled before the `event.type !== "message"` guard in the events handler. (3) `views.publish({ user_id, view: { type: "home", blocks } })` is the API call. (4) If the user is not registered (no person row with their slack_user_id), render a "not linked" home view rather than failing. (5) No DB migration required — reuses existing storage methods.
- Action: When extending the App Home, modify `buildAppHomeBlocks` in `server/slack.ts` and re-publish. The home is always fetched fresh on open so no caching concerns.
- Evidence: `server/slack.ts` (buildAppHomeBlocks, publishAppHome); `server/routes.ts` (app_home_opened handler before message guard).

## applyRotaTasksForWeek — must isolate per-rota errors to avoid all-or-nothing failures

- Date: 2026-05-18
- Trigger: One rota task with a bad DB reference (or a transient error) was found to fail the entire `applyRotaTasksForWeek` call, leaving all other valid rota tasks unapplied for that week.
- Learning: Wrap the outer `for (const rotaTask of activeRotaTasks)` body in a try/catch. Log the error with `console.error` including the `rotaTask.id` and `weekStartDate`, then `continue` to the next task. This makes the function partially tolerant rather than all-or-nothing.
- Action: In any loop that processes independent records (rota tasks, bulk assignments), always wrap each iteration in try/catch so one failure doesn't abort the rest.
- Evidence: `server/storage.ts` `applyRotaTasksForWeek` — fixed 2026-05-18.