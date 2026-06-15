import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

export type Day = typeof DAYS[number];

// Replit Auth: Session storage table (required for authentication)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Replit Auth: User storage table (required for authentication)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("member"), // "member" | "admin" | "super_admin"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workspaces — each workspace is a separate team/lab
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  rainbowMode: integer("rainbow_mode").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Workspace membership — which users belong to which workspaces
export const workspaceUsers = pgTable("workspace_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  role: varchar("role").notNull().default("member"), // "admin" | "member"
  createdAt: timestamp("created_at").defaultNow(),
});

export const people = pgTable("people", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull(),
  order: integer("order").default(0),
  excluded: integer("excluded").default(0),
  userId: varchar("user_id"),
  workspaceId: varchar("workspace_id").notNull().default("default"),
  slackUserId: varchar("slack_user_id"),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull(),
  description: text("description"),
  order: integer("order").default(0),
  batchSize: integer("batch_size"),
  isProduction: integer("is_production").default(1),
  requiredDaily: integer("required_daily").default(0),
  showInPipelineView: integer("show_in_pipeline_view").default(0),
  workspaceId: varchar("workspace_id").notNull().default("default"),
});

// Instruments — bookable equipment (automation robots, sequencers, lab
// equipment), managed per-workspace in Admin → Instruments.
export const instruments = pgTable("instruments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type"),
  location: text("location"),
  assetNumber: text("asset_number"),
  order: integer("order").default(0),
  workspaceId: varchar("workspace_id").notNull().default("default"),
});

export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  personId: varchar("person_id").notNull(),
  day: text("day").notNull(),
  weekStartDate: text("week_start_date").notNull(),
  batchNumber: text("batch_number"),
  batchSize: integer("batch_size"),
  notes: text("notes"),
  date: text("date"),
  order: integer("order").default(0),
  customName: text("custom_name"),
  customColor: text("custom_color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdById: varchar("created_by_id"),
  workspaceId: varchar("workspace_id").notNull().default("default"),
  // Set when this assignment was auto-created by a rota task; used to prevent
  // re-creation after the user deliberately deletes a rota-generated slot.
  rotaTaskId: varchar("rota_task_id"),
  // Groups all assignments created together as a recurring series so the whole
  // series can be deleted at once. NULL for one-off assignments.
  seriesId: varchar("series_id"),
  // Ties multiple cards together as one logical piece of work (e.g. a 5-day
  // library prep). Person-agnostic; may span weeks after individual moves.
  // NULL for ungrouped cards. Invariant: a group always has >= 2 members
  // (singletons are auto-dissolved). Composes with seriesId: a recurring
  // multi-day prep shares one seriesId across weeks, one linkedGroupId per week.
  linkedGroupId: varchar("linked_group_id"),
  // Books this assignment onto one or more pieces of equipment (instruments table).
  // Empty array = no instrument booked. No FK constraint; deleteInstrument removes
  // entries from this array via array_remove.
  instrumentIds: text("instrument_ids").array().notNull().default([]),
  // When 1, a Slack DM is sent to the assigned person at 9 AM on the day.
  slackNotify: integer("slack_notify").notNull().default(0),
  // When 1, Slack DMs are sent when this assignment is created or deleted.
  slackChangeNotify: integer("slack_change_notify").notNull().default(0),
}, (t) => [
  // Unique index on the rota slot triple so concurrent apply calls can use
  // ON CONFLICT DO NOTHING instead of a racy read-then-insert.
  // NULL != NULL in PostgreSQL, so regular (non-rota) rows are unaffected.
  uniqueIndex("assignments_rota_slot_unique")
    .on(t.rotaTaskId, t.weekStartDate, t.day)
    .where(sql`${t.rotaTaskId} IS NOT NULL`),
]);

// Tombstone records that prevent applyRotaTasksForWeek from recreating an
// assignment the user deliberately deleted.  One row per (rotaTaskId,
// weekStartDate, day) triple; created atomically when a rota-generated
// assignment is hard-deleted.
export const rotaSkips = pgTable("rota_skips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rotaTaskId: varchar("rota_task_id").notNull(),
  weekStartDate: text("week_start_date").notNull(),
  day: text("day").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("rota_skips_unique").on(t.rotaTaskId, t.weekStartDate, t.day),
]);

export const premadeFilters = pgTable("premade_filters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  personIds: text("person_ids").array().notNull().default([]),
  taskIds: text("task_ids").array().notNull().default([]),
  workspaceId: varchar("workspace_id").notNull().default("default"),
});

export const rotaTasks = pgTable("rota_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  taskId: varchar("task_id").notNull(),
  personIds: text("person_ids").array().notNull().default([]),
  frequency: text("frequency").notNull().default("weekly"), // "daily" | "weekly"
  day: text("day").notNull().default("Monday"), // used for "weekly" cadence; ignored for "daily"
  startDate: text("start_date").notNull(),
  // How many weeks between active rotations (Option A: skip N-1 weeks between turns).
  // intervalWeeks=1 → active every week; intervalWeeks=3 → active week 1, skip 2-3, active week 4…
  intervalWeeks: integer("interval_weeks").notNull().default(1),
  weekLimit: integer("week_limit"),
  archivedAt: timestamp("archived_at"),
  order: integer("order").default(0),
  workspaceId: varchar("workspace_id").notNull().default("default"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  type: text("type").notNull(), // "assignment_created" | "assignment_updated"
  title: text("title").notNull(),
  body: text("body"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: text("related_entity_id"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export const userNotificationSettings = pgTable("user_notification_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  dailyReminder: integer("daily_reminder").notNull().default(1),
  weeklyPreview: integer("weekly_preview").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserNotificationSettings = typeof userNotificationSettings.$inferSelect;
export const insertUserNotificationSettingsSchema = createInsertSchema(userNotificationSettings).omit({ id: true, updatedAt: true }).extend({
  dailyReminder: z.number().int().min(0).max(1).optional(),
  weeklyPreview: z.number().int().min(0).max(1).optional(),
});

export const isoDateString = z.string()
  .trim()
  .refine((val) => val.length > 0, { message: "Required" })
  .refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), { message: "Use YYYY-MM-DD" })
  .refine((val) => !Number.isNaN(Date.parse(val)), { message: "Invalid date" });

export const insertPersonSchema = createInsertSchema(people).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true });
export const insertAssignmentSchema = createInsertSchema(assignments).omit({ id: true }).extend({
  day: z.enum(DAYS),
  weekStartDate: isoDateString,
  // Explicit overrides — drizzle-zod may omit these integer-with-default columns from
  // the generated schema, causing .parse() to strip them. Defining them here ensures
  // the values survive the parse on both client and server.
  slackNotify: z.number().int().min(0).max(1).optional(),
  slackChangeNotify: z.number().int().min(0).max(1).optional(),
  // Explicit override so the field is guaranteed to survive .parse() (same
  // strip-on-parse risk class as the integer-with-default columns above).
  linkedGroupId: z.string().nullable().optional(),
  instrumentIds: z.array(z.string()).optional().default([]),
});
export const insertInstrumentSchema = createInsertSchema(instruments).omit({ id: true });
export const insertPremadeFilterSchema = createInsertSchema(premadeFilters).omit({ id: true });
export const insertRotaTaskSchema = createInsertSchema(rotaTasks).omit({ id: true, createdAt: true, archivedAt: true }).extend({
  day: z.enum(DAYS),
  frequency: z.enum(["daily", "weekly"]),
  startDate: isoDateString,
  personIds: z.array(z.string()).min(1, "At least one person is required"),
  intervalWeeks: z.preprocess(
    (value) => (value === "" || value === undefined) ? 1 : value,
    z.coerce.number().int().min(1).max(52).default(1),
  ),
  weekLimit: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.coerce.number().int().min(1).max(500).optional(),
  ),
});
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });
export const insertWorkspaceUserSchema = createInsertSchema(workspaceUsers).omit({ id: true, createdAt: true });

export type Person = typeof people.$inferSelect;
export type InsertPerson = z.infer<typeof insertPersonSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type Instrument = typeof instruments.$inferSelect;
export type InsertInstrument = z.infer<typeof insertInstrumentSchema>;

export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

export type PremadeFilter = typeof premadeFilters.$inferSelect;
export type InsertPremadeFilter = z.infer<typeof insertPremadeFilterSchema>;

export type RotaTask = typeof rotaTasks.$inferSelect;
export type InsertRotaTask = z.infer<typeof insertRotaTaskSchema>;

export type RotaSkip = typeof rotaSkips.$inferSelect;

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;

export type WorkspaceUser = typeof workspaceUsers.$inferSelect;
export type InsertWorkspaceUser = z.infer<typeof insertWorkspaceUserSchema>;

export const siteAnnouncements = pgTable("site_announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"), // "info" | "warning" | "success" | "error" | "announcement" | "maintenance" | "update"
  isActive: integer("is_active").notNull().default(0),
  createdById: varchar("created_by_id"),
  createdAt: timestamp("created_at").defaultNow(),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
});

export type SiteAnnouncement = typeof siteAnnouncements.$inferSelect;
export const insertSiteAnnouncementSchema = createInsertSchema(siteAnnouncements).omit({ id: true, createdAt: true });
