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

- Date: 2026-05-15 (updated 2026-05-29)
- Trigger: Added sitewide notification bar feature (Admin → Announcements section).
- Learning: The `site_announcements` table requires a raw SQL migration. Only one announcement can be active (`is_active=1`) at a time; `activateSiteAnnouncement` deactivates all rows before setting the target. The bar is dismissable — clicking × stores the dismissal in `localStorage` (keyed `dismissed_announcement`, with `announcementId` + `dismissedAt`). It reappears after 24 hours or if the active announcement changes to a different ID. All authenticated users (not just super-admins) can manage announcements via the Admin page. Valid types: "info" | "warning" | "success" | "error" | "announcement" | "maintenance" | "update". `starts_at` and `expires_at` columns were added to enable scheduled/expiring announcements — `getActiveSiteAnnouncement` filters by these in addition to `is_active`. The announcement bar respects both the active flag AND the date window.
- Action: Always provide the raw SQL for the user to run directly in Replit's database shell. Mutation functions for announcements must pass type/dates as explicit parameters (not closures) to avoid stale-value bugs. See Evidence for the exact SQL.
- Evidence: `shared/schema.ts` siteAnnouncements table; `server/storage.ts` getActiveSiteAnnouncement; SQL migrations:
  ```sql
  CREATE TABLE IF NOT EXISTS site_announcements (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), message TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info', is_active INTEGER NOT NULL DEFAULT 0, created_by_id VARCHAR, created_at TIMESTAMP DEFAULT NOW());
  ALTER TABLE site_announcements ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP;
  ALTER TABLE site_announcements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
  ```

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

## Slack PATCH notifications — update DMs cover reassignment, date, notes, and detail changes

- Date: 2026-05-19
- Trigger: PATCH /api/assignments/:id had no Slack notification; only POST (create) and DELETE triggered DMs.
- Learning: The PATCH route must compare `existing` vs `parsed` to detect meaningful changes. Two distinct cases: (1) person changed — notify old person with `:x: reassigned` and new person with `:calendar: assigned` (including notes if present); (2) same person, other fields changed (taskId, customName, day, weekStartDate, notes, batchNumber, batchSize) — notify with `:pencil2: updated` + notes if present. Use an async IIFE with `.catch()` after `res.json()` so Slack failures never affect the HTTP response.
- Action: When adding more PATCH-triggered DMs, use the same async IIFE pattern. Check `f in parsed && parsedVal !== undefined && (parsedVal ?? null) !== (existingVal ?? null)` to distinguish "field not sent" from "field sent but unchanged".
- Evidence: `server/routes.ts` PATCH /api/assignments/:id — Slack IIFE block after `res.json(updated)`.

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

## Slack enriched notifications — APP_URL env var and deep links

- Date: 2026-05-19
- Trigger: Added what-changed summary and deep link to Slack DM notifications for assignment changes.
- Learning: (1) Use `process.env.APP_URL` (set in Replit Secrets, no trailing slash) as the base URL for deep links. If unset, `buildSchedulerLink` returns `""` — notifications send cleanly with no link. (2) Slack mrkdwn link format is `<URL|label>`. (3) `buildChangeSummary` compares `existing` vs `updated` for: day, weekStartDate, taskId (requires fetching old task name separately), customName, notes, batchNumber/batchSize. (4) The scheduler reads `?week=YYYY-MM-DD` URL param on mount to jump to the correct week. (5) Reassignment DMs now include the other person's name for context.
- Action: When adding more Slack notification types, import `buildSchedulerLink` from `slack.ts` and append its return value to the message. Always guard on `APP_URL` being set so the feature degrades gracefully.
- Evidence: `server/slack.ts` (buildSchedulerLink, buildChangeSummary); `server/routes.ts` PATCH/POST/DELETE assignment notification blocks; `client/src/pages/scheduler.tsx` currentWeekStart useState.

## Slack App Home — shows full week but users expect day/next-week scoping

- Date: 2026-05-19
- Trigger: User reported "next week" command showed current week; "today" and "tomorrow" showed the whole week. Root cause: App Home always shows the full current week regardless of DM commands, so users looking at the App Home see the wrong scope. Additionally, Slack can send "next week" with a non-breaking space ( ) instead of a regular space, causing `text.includes("next week")` to fail and fall through to the "week" branch (showing current week).
- Learning: (1) Normalize non-breaking spaces before command matching: `((event.text as string) ?? "").replace(/ /g, " ").toLowerCase().trim()`. (2) The App Home must show today/tomorrow highlighted and next week's schedule to match user expectations. Use `renderWeekRows(rows, weekStartDate, todayDayName, tomorrowDayName)` with 📍/🔜 markers for today/tomorrow. Fetch next week rows in `app_home_opened` handler via `getOffsetMondayUTC(1)`. (3) tomorrowName is `WEEKDAYS[utcDayIndex]` for Mon–Thu (utcDayIndex 1–4); `undefined` on Fri/weekend.
- Action: When extending Slack bot commands, always test with both regular spaces and non-breaking spaces. When adding new App Home sections, refactor the week-render logic into `renderWeekRows` helper to avoid code duplication.
- Evidence: `server/slack.ts` (renderWeekRows, buildAppHomeBlocks); `server/routes.ts` (text normalization line, app_home_opened handler, slack-refresh-home endpoint).

## Menu items must be gated by the same role required to access the page

- Date: 2026-05-21
- Trigger: Announcements (and all other Admin section links) were visible in the cog menu to all authenticated users, even though the pages are admin-only. The `/admin` route itself was also unprotected in App.tsx.
- Learning: Every menu item in the cog dropdown must be wrapped in the same role guard as the page it links to. Showing a link to a page the user cannot access is confusing and a leakage risk. The `isAdmin` check already used for Reporting must also wrap the Admin section (People, Tasks, Rota, Announcements). Workspaces stays gated on `super_admin` inside that block. The `/admin` route in `App.tsx` must use `isAdminUser ? Admin : NotFound` just like the reporting routes.
- Action: When adding any new page or admin section, immediately add the same role gate to both the cog menu `DropdownMenuItem` in `scheduler.tsx` AND the `<Route>` in `App.tsx`. Never add a menu link without checking what role the destination requires.
- Evidence: `client/src/pages/scheduler.tsx` cog dropdown; `client/src/App.tsx` route definitions.

## Per-user notification settings — new table + LEFT JOIN cron filter pattern

- Date: 2026-05-21
- Trigger: Added user-level opt-out toggles for the two Slack cron DMs (daily reminder, Friday preview).
- Learning: (1) New `user_notification_settings` table keyed on `user_id` (UNIQUE). Both flags default to 1 (enabled) so existing users keep receiving notifications until they opt out. (2) Cron storage functions filter via LEFT JOIN on this table through `people.userId → user_notification_settings.userId`. The WHERE clause uses `OR(isNull(people.userId), isNull(userNotificationSettings.userId), eq(..., 1))` to treat people without a user account and users without a settings row as opted-in. (3) The settings page lives at `/settings` (no admin guard) — all authenticated users can access it. (4) `or` must be explicitly imported from drizzle-orm; it was missing from the existing imports. (5) Use the explicit drizzle-zod `.extend()` override for integer-with-default columns to avoid the strip-on-parse issue.
- Action: When adding more per-user cron opt-outs, extend `user_notification_settings` with a new integer column and add the LEFT JOIN OR filter to the relevant storage function. Always provide the SQL migration for Replit.
- Evidence: `shared/schema.ts` userNotificationSettings table; `server/storage.ts` getTodaysSlackAssignments, getPeopleWithSlackIdsForWeek, getNotificationSettings, upsertNotificationSettings; `server/routes.ts` GET/PATCH /api/user/notification-settings; `client/src/pages/settings.tsx`; SQL: `CREATE TABLE IF NOT EXISTS user_notification_settings (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR NOT NULL UNIQUE, daily_reminder INTEGER NOT NULL DEFAULT 1, weekly_preview INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMP DEFAULT NOW());`

## applyRotaTasksForWeek — must isolate per-rota errors to avoid all-or-nothing failures

- Date: 2026-05-18
- Trigger: One rota task with a bad DB reference (or a transient error) was found to fail the entire `applyRotaTasksForWeek` call, leaving all other valid rota tasks unapplied for that week.
- Learning: Wrap the outer `for (const rotaTask of activeRotaTasks)` body in a try/catch. Log the error with `console.error` including the `rotaTask.id` and `weekStartDate`, then `continue` to the next task. This makes the function partially tolerant rather than all-or-nothing.
- Action: In any loop that processes independent records (rota tasks, bulk assignments), always wrap each iteration in try/catch so one failure doesn't abort the rest.
- Evidence: `server/storage.ts` `applyRotaTasksForWeek` — fixed 2026-05-18.

## Instruments scope — new table + assignment field, multiple zod parse paths to extend

- Date: 2026-06-12
- Trigger: Added the Instruments booking feature (instruments table, `assignments.instrument_id`, Instrument view, Admin → Instruments).
- Learning: (1) Any new field on `assignments` must be added to THREE zod allowlists or it is silently stripped: `insertAssignmentSchema.extend()` in `shared/schema.ts` (POST + bulk), `assignmentPatchSchema` in `routes.ts` (PATCH from the details drawer), and `groupPatchSchema` in `routes.ts` (apply-to-group saves; also extend the `updateGroupFields` Pick type in `storage.ts` and its "cannot combine with move" refine). (2) Card-copying paths that must carry the field forward: `duplicate-assignment-dialog.tsx` payload builder, `weekly-calendar.tsx` `handlePaste`, and the drawer's `restoreMutation` (delete-undo). (3) The view switcher is now a single dropdown (`VIEW_OPTIONS` in `scheduler.tsx`); new views extend the `ViewMode` union, the week-query `enabled` guard, and the rota auto-apply guard. (4) `deleteInstrument` nulls out `assignments.instrument_id` in app code (no FK constraint) and the DELETE route broadcasts both "instruments" and "assignments". (5) Radix Select cannot represent `""` — use the `"__none__"` sentinel mapped to `null` (same pattern as the person-link dropdown in admin).
- Action: When adding the next assignment-level field, grep for `slackChangeNotify` to find every allowlist/copy path at once. When adding a new scheduler view, copy `instrument-view.tsx` (which already fixes pipeline-view's key-on-fragment-child bug).
- Evidence: SQL migration required (run in Replit's database shell BEFORE deploying this code):
  ```sql
  CREATE TABLE IF NOT EXISTS instruments (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text,
    location text,
    asset_number text,
    "order" integer DEFAULT 0,
    workspace_id varchar NOT NULL DEFAULT 'default'
  );
  ALTER TABLE assignments ADD COLUMN IF NOT EXISTS instrument_id varchar;
  ALTER TABLE instruments ADD COLUMN IF NOT EXISTS asset_number text;
  ```

## Rainbow Mode — day column colour coding via Tailwind static arrays

- Date: 2026-06-08
- Trigger: Added per-day colour coding to the weekly calendar (Mon=red, Tue=yellow/orange gradient, Wed=green, Thu=blue, Fri=purple/pink gradient).
- Learning: Use static string arrays indexed by `dayIndex` (0=Mon … 4=Fri) for day-specific Tailwind classes. Tailwind's JIT scanner finds class names in string literals inside arrays. `bg-gradient-to-b from-yellow-200 to-orange-200` and similar gradient combos work as single string entries. Annual leave (`bg-red-200/80`) still overrides the day base colour at highest precedence. The `isCurrentWeekDisplay` variable was removed because day-colour cells replace the previous green alternating-row logic.
- Action: When extending day colours, edit the six `DAY_*_COLORS` arrays at the top of `weekly-calendar.tsx`. Keep annual leave override first in the ternary chain.
- Evidence: `client/src/components/weekly-calendar.tsx` `DAY_HEADER_COLORS`, `DAY_CELL_COLORS`, etc.

## Session timeout UX — hard redirect hid toast and showed Landing page as crash

- Date: 2026-06-08 (updated 2026-06-15)
- Trigger: User reported frequent jarring logouts where the app appeared to crash (showed Landing page) rather than a clear timeout message. Follow-up 2026-06-15: user returned after a weekend and the week view was completely blank despite the session-expired banner showing correctly.
- Learning: (1) `window.location.assign` in `queryClient.ts` fired before React could re-render, so the destructive toast in `useAuth.ts` never appeared. (2) `App.tsx` rendered `<Landing />` when `!isAuthenticated`, which looked like a crash not a logout. (3) The automatic redirect removed user agency. (4) The 60-second proactive OIDC token refresh buffer was too small for a Replit server waking from sleep, causing spurious 401s. Fix (2026-06-08): removed `maybeRedirectToLogin` entirely; added `sessionExpired` state in `useAuth`; `App.tsx` now renders routes (showing cached data) + a persistent amber corner banner ("Session timed out — click to sign back in") when `sessionExpired`; refresh buffer increased to 5 minutes. **Blank week fix (2026-06-15):** There is a one-render gap between the auth query resolving null (`isAuthenticated=false`) and the useEffect setting `sessionExpired=true`. During that gap App.tsx hit `!isAuthenticated && !sessionExpired` and rendered `<Landing />`, UNMOUNTING the Scheduler and resetting `currentWeekStart` to today. On remount the scheduler queried the new (unvisited) week → no cached data → blank. Three related fixes: (a) `useAuth` now returns `wasEverAuthenticated` (the ref value); (b) `App.tsx` Landing guard adds `&& !wasEverAuthenticated` so the flash never happens; (c) assignment queries are disabled (`enabled: !sessionExpired`) when session expired so they don't fire 401s; (d) `onVisibilityChange` skips data-query invalidation when `sessionExpired`; (e) Scheduler shows a "sign back in" inline placeholder when session is expired AND no cached data is available for the current week.
- Action: Never auto-redirect on 401. Signal session expiry via React state, keep routes rendered so React Query cache stays visible. The `SessionExpiredBanner` component handles the re-auth call-to-action. When the user clicks "Sign back in", `returnTo` param brings them back to the same page. Guard the Landing page route with `!wasEverAuthenticated` to prevent one-render flashes from unmounting child components.
- Evidence: `client/src/hooks/useAuth.ts` (sessionExpired state, wasEverAuthenticated); `client/src/lib/queryClient.ts` (removed maybeRedirectToLogin); `client/src/components/session-expired-banner.tsx` (new); `client/src/App.tsx` (sessionExpired gate, wasEverAuthenticated guard, sessionExpired passed to useRealTimeUpdates); `server/replitAuth.ts` (300s refresh buffer); `client/src/pages/scheduler.tsx` (query enabled guards, showSessionExpiredPlaceholder).

## React Query v5 — `data` is preserved on error; use `returnNull` not `throw` for auth detection

- Date: 2026-06-08
- Trigger: The session-expired banner was wired up correctly in `App.tsx` and `useAuth.ts`, but never appeared during testing. Root cause: React Query v5 preserves the last successful `data` value when a query enters an error state. The `/api/auth/user` query used the default `on401: "throw"` queryFn, so a 401 caused it to throw; React Query set `status: "error"` but kept `data = <previous user object>`. `isAuthenticated = !!user` stayed `true`, so `sessionExpired` was never set.
- Learning: For any query where you need `data` to become `null`/`undefined` on a 401 (e.g., auth checks), use `queryFn: getQueryFn({ on401: "returnNull" })`. This returns `null` as a resolved value, making `data = null` explicitly. For queries where you want to show cached data through errors (all other app queries), the default `on401: "throw"` is correct — the preserved data enables the "last known state" UX.
- Action: The `/api/auth/user` query in `useAuth.ts` must always use `on401: "returnNull"`. All other workspace-scoped queries should keep `on401: "throw"`.
- Evidence: `client/src/hooks/useAuth.ts` line 10-14; `client/src/lib/queryClient.ts` `getQueryFn` options.

## passport ≥0.6 req.login() regenerates the session ID — never use it for token refresh

- Date: 2026-06-12
- Trigger: Session-persistence review found users being logged out early despite a 180-day session TTL.
- Learning: passport 0.6+/0.7 `req.login()` calls `req.session.regenerate()` by default (session-fixation protection). The token-refresh path in `isAuthenticated` (`server/replitAuth.ts`) called `req.login()` on every ~hourly refresh, which (a) wiped all session data including `activeWorkspaceId` (the real root cause behind the 2026-06-09 "workspace session loss" entry — the save race was secondary), (b) 401'd concurrent requests still holding the old session ID, and (c) with `rolling: true`, let a late response re-send the destroyed session ID cookie, permanently logging the user out. Because `serializeUser`/`deserializeUser` are pass-throughs, `req.user` IS `req.session.passport.user`, so after `updateUserSession(user, tokens)` a plain `req.session.save()` persists the new tokens — no `req.login()` needed.
- Action: Never call `req.login()` outside the initial OIDC callback. On the callback route, pass `keepSessionInfo: true` to `passport.authenticate` so `session.returnTo` survives the (intentional) regeneration. When mutating sessions in concurrent-request paths, always reload-then-save: use `reloadSessionTolerant` (exported from `replitAuth.ts`) before the write, or `persistActiveWorkspace` in `routes.ts` for workspace writes (`overwrite: false` for auto-select paths so a concurrent explicit choice wins). The refresh path also reloads first and adopts already-fresh tokens instead of issuing a duplicate grant (refresh tokens may be single-use).
- Evidence: Fixed 2026-06-12 in `server/replitAuth.ts` (refresh block now reload + direct `session.passport` write + save; `keepSessionInfo` on /api/callback; reload in `extendSessionRow`) and `server/routes.ts` (`persistActiveWorkspace` helper used by requireWorkspace recovery, GET/POST /api/my-workspace, complete-onboarding, workspace join). passport ^0.7.0 SessionManager.logIn regenerates the session ID by default.

## Workspace session loss — concurrent request race overwrites activeWorkspaceId

- Date: 2026-06-09
- Trigger: Users saw "Your workspace session has ended. Please choose a workspace again." on rota task operations, far more often than expected.
- Learning: When the page loads, multiple requests fire concurrently (assignments, workspace, auth, etc.). Each request independently loads the session from the DB. If `GET /api/my-workspace` and a token-refresh from `isAuthenticated` run concurrently: (1) both load the session without `activeWorkspaceId` (first load after server wake); (2) workspace route sets `activeWorkspaceId` in its in-memory copy; (3) token refresh calls `req.login()` + `req.session.save()` from its copy (still without `activeWorkspaceId`); (4) if the token-refresh save lands last it overwrites the workspace write, leaving `activeWorkspaceId` absent from the DB. Next request's `requireWorkspace` gets no workspace → 400.
- Action: (1) `requireWorkspace` now auto-recovers by looking up the user's first workspace from DB when the session is missing it — this eliminates the visible error even when the race occurs. (2) `GET /api/my-workspace` (auto-select path) and `POST /api/my-workspace` now call `await session.save()` before sending the response, so the workspace is in the DB before the client fires any follow-up requests.
- Evidence: `server/routes.ts` `requireWorkspace` middleware; `/api/my-workspace` GET and POST handlers.

## Linked task groups — linkedGroupId composes with seriesId, never reuse seriesId

- Date: 2026-06-12
- Trigger: Added "linked task groups" (tie multiple cards together as one piece of work, e.g. a 5-day library prep) with delete/move/unlink/shared-edit group operations.
- Learning: (1) `assignments.linked_group_id` (nullable varchar, no index) is a THIRD grouping mechanism alongside `seriesId` (recurring occurrences across weeks) and `rotaTaskId` (rota-generated). They compose: a weekly-recurring 5-day prep gets ONE seriesId across all weeks plus ONE linkedGroupId per calendar week (see `weekGroupIds` map in add-assignment-dialog.tsx). Never overload seriesId for intra-week grouping — "delete this week's group" and "delete the whole series" must stay distinct operations. (2) Invariant: a group always has ≥2 members; singletons are auto-dissolved via `dissolveSingletonGroups` in storage.ts, hooked into `deleteAssignment`, `deleteAssignmentSeries`, `unlinkAssignment`, and `linkAssignments` (re-linking out of an old group). (3) `deleteGroup` and the fixed `deleteAssignmentSeries` create rota_skips tombstones from the DELETE…RETURNING rows — any future bulk-delete of assignments must do the same or rota re-apply resurrects the rows. (4) No index on linked_group_id by design (rare ops, small table, insert cost matters more); add a partial index `WHERE linked_group_id IS NOT NULL` only if the assignments table grows ~100x. (5) Group routes: POST /api/assignments/link, POST /api/assignments/unlink, PATCH + DELETE /api/assignments/group/:groupId. PATCH rejects mixing a move (dayOffset/personId) with field edits; personId reassignment requires dayOffset (0 allowed). Group delete broadcasts `{ action: "delete-group", record: { ids } }` which App.tsx handles with a zero-refetch cache filter. (6) Copy/paste, Duplicate, and the drawer's delete-undo restore all use explicit field lists, so linkedGroupId is never copied — keep it that way. (7) Visual connector: an SVG overlay (`group-connector-overlay`) inside a `relative min-w-fit` wrapper around the week table draws amber lines between consecutive group members; card DOM nodes are registered in `groupCardElsRef` via callback refs (Radix `asChild` Slot composes refs, so this coexists with ContextMenuTrigger) and measured in a useEffect + ResizeObserver. Overlay z-10 paints above card bodies but below badges (z-20) and the sticky person column (z-30); coordinates are wrapper-relative so scrolling needs no handling. (8) Cell ordering: linked groups get a shared display rank (lowest `order` among members this week) computed inside the `assignmentsByCell` memo, with grouped-cards-first + groupId tie-breaks, so members sit at the same position in every cell — purely client-side, no DB writes. Consequence: an ungrouped card cannot be reordered above a linked group while their ranks tie. (9) The drawer's apply-to-group checkbox was replaced by a save-time AlertDialog ("Only this card" / "All linked cards") that only appears when fields actually changed (dirty check in `handleSave`).
- Action: When adding new group operations, extend groupPatchSchema / the existing endpoints rather than adding per-card loops, and preserve the singleton sweep + tombstone behaviour.
- Evidence: `shared/schema.ts` assignments.linkedGroupId; `server/storage.ts` "Linked task groups" section; `server/routes.ts` group routes; `client/src/components/weekly-calendar.tsx` group menus/dialogs; `client/src/components/task-details-drawer.tsx` apply-to-group save. SQL migration (run in Replit BEFORE deploying): `ALTER TABLE assignments ADD COLUMN IF NOT EXISTS linked_group_id VARCHAR;`

## extractErrorMessage now lives in client/src/lib/extract-error.ts

- Date: 2026-06-12
- Trigger: Group-operation mutations needed server error messages (e.g. "Moving the group would land the Monday card on a weekend") surfaced in toasts; the helper was private to admin.tsx.
- Learning: `extractErrorMessage` is exported from `client/src/lib/extract-error.ts` (strips the "400: " status prefix that apiRequest prepends). admin.tsx still has its own private copy — its call sites were deliberately not churned in this change.
- Action: Import from `@/lib/extract-error` in new mutation onError/catch blocks instead of redefining it. Migrating admin.tsx to the shared helper is safe whenever that file is next touched.

## AddAssignmentDialog — optional personId + initial field pre-fill pattern

- Date: 2026-06-12
- Trigger: Added cell-click to create assignments from pipeline and instrument views, where the task/instrument is known from the row but the person is not.
- Learning: `personId` is now optional in `AddAssignmentDialogProps` (default `""`). When empty, a Person dropdown is rendered at the top of the form. `initialTaskId` and `initialInstrumentId` props pre-fill those fields on open. `effectivePersonId = personId || selectedPersonId` is used in all mutation payloads. Validation at the start of `onSubmit` and `handleCreateAllWeek` rejects submission when `effectivePersonId` is empty. The person picker uses a plain `<label>` + `<Select>` (NOT `FormControl`/`FormField`) since it is not a react-hook-form field. `useEffect` reset applies initial values; deps include `personId, initialTaskId, initialInstrumentId`.
- Action: When calling `AddAssignmentDialog` without a known person (e.g. from a view where the row is the task or instrument), pass `people={people}` and omit `personId`. Pass `initialTaskId` or `initialInstrumentId` to pre-fill context from the row. Views that host the dialog must add `slackEnabled` prop and manage their own `selectedCell` state.
- Evidence: `client/src/components/add-assignment-dialog.tsx`; `client/src/components/pipeline-view.tsx`; `client/src/components/instrument-view.tsx`.

## Workspace-level display toggles — rainbowMode pattern

- Date: 2026-06-08 (corrected 2026-06-08)
- Trigger: Added admin toggle ("Rainbow Mode") to enable/disable day column colour coding per workspace. Commit `8333329` later renamed the DB column from `color_coded_days` → `rainbow_mode` for consistency, which broke production until the correct migration was run.
- Learning: Workspace display preferences are stored as integer columns on the `workspaces` table (1=enabled, 0=disabled). The TypeScript property is `rainbowMode`; the DB column is **`rainbow_mode`** (NOT `color_coded_days` — that was the old name). If the ORM column name ever changes in `schema.ts`, the SQL migration and this entry must be updated in the same commit. The `insertWorkspaceSchema` auto-includes new columns, and the PUT /api/workspaces/:id route uses `insertWorkspaceSchema.partial()` so no route changes are needed. Convert boolean→integer in the mutation before sending, and integer→boolean when populating the edit form. Invalidate `/api/my-workspace` AND `/api/my-workspaces` on update so the scheduler picks up the new value when the user navigates back.
- Action: When adding future workspace display preferences, follow this pattern: add integer column to workspaces table (default 1), add Switch in the workspaces edit dialog in admin.tsx, pass through useWorkspace → scheduler → component.
- Evidence: `shared/schema.ts` workspaces table (`rainbowMode` prop → `rainbow_mode` column); `client/src/pages/admin.tsx` WorkspaceManagementSection; `client/src/pages/scheduler.tsx` WeeklyCalendar props; `client/src/components/weekly-calendar.tsx` rainbowMode prop.
  SQL (safe for both fresh-add and rename-from-old-name):
  ```sql
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workspaces' AND column_name='color_coded_days') THEN
      ALTER TABLE workspaces RENAME COLUMN color_coded_days TO rainbow_mode;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workspaces' AND column_name='rainbow_mode') THEN
      ALTER TABLE workspaces ADD COLUMN rainbow_mode INTEGER NOT NULL DEFAULT 1;
    END IF;
  END $$;
  ```

## Modifier-key drag shortcuts — access via DragEvent, not keyboard state

- Date: 2026-06-12
- Trigger: Added Ctrl/Shift modifier shortcuts to skip the linked-group drag popup.
- Learning: The HTML drag `onDrop` handler receives a `DragEvent` that carries `e.ctrlKey` and `e.shiftKey` at drop time. No separate keydown tracking is needed. Change `onDrop={() => {` → `onDrop={(e) => {` to access these. The modifier check sits inside the `linkedGroupId` branch, before `setPendingGroupMove`, so the popup is only shown when no modifier is held.
- Action: For future modifier-key drag behaviour, capture the event in `onDrop={(e) => {` and branch on `e.ctrlKey` / `e.shiftKey` / `e.altKey`. Always add the new shortcuts to the "Mouse interactions" section of `help-guide.tsx`.

## Multiple instruments per assignment — instrumentId → instrumentIds array

- Date: 2026-06-15
- Trigger: Changed instrument booking from a single `instrumentId varchar` column to `instrumentIds text[]` (Postgres array), supporting parallel runs (same task on multiple instruments simultaneously).
- Learning: (1) `assignments.instrument_ids` is a `text[]` NOT NULL DEFAULT `{}` column. The old `instrument_id` column was dropped. (2) The DB migration is a three-step operation: add column, back-fill, drop old column (alert user to run in Replit). (3) `deleteInstrument` now uses `array_remove(instrument_ids, id)` instead of `SET NULL` — use Drizzle `sql` template tag: `sql\`array_remove(\${assignments.instrumentIds}, \${id})\``, with WHERE clause `sql\`\${id} = ANY(\${assignments.instrumentIds})\``. (4) Instrument view filters use `.instrumentIds?.includes(instrument.id)` instead of `=== instrument.id`. An assignment appears in EVERY row for each instrument it's booked onto. (5) Drag-drop in instrument view replaces the full `instrumentIds` array with `[targetInstrumentId]` — dragging expresses intent to move to that single instrument. (6) All four zod allowlists were updated: `insertAssignmentSchema` (`shared/schema.ts`), `assignmentPatchSchema` and `groupPatchSchema` (`routes.ts`), and the `updateGroupFields` Pick type (`storage.ts`). (7) The reusable `InstrumentMultiSelect` component uses Popover + Command (cmdk) + Badge chips — searchable, handles any count. (8) `premadeFilters.person_ids` and `rota_tasks.person_ids` already used `text().array()` — follow the same pattern for any future array columns.
- Action: Use the `InstrumentMultiSelect` component from `client/src/components/instrument-multi-select.tsx` for any future multi-entity picker. Grep for `instrumentIds` to find all assignment-level allowlists that need updating when adding further fields.
- Evidence: SQL migration (run in Replit BEFORE deploying):
  ```sql
  ALTER TABLE assignments ADD COLUMN IF NOT EXISTS instrument_ids text[] NOT NULL DEFAULT '{}';
  UPDATE assignments SET instrument_ids = ARRAY[instrument_id]::text[] WHERE instrument_id IS NOT NULL;
  ALTER TABLE assignments DROP COLUMN IF EXISTS instrument_id;
  ```