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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workspaces — each workspace is a separate team/lab
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
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
});
export const insertPremadeFilterSchema = createInsertSchema(premadeFilters).omit({ id: true });
export const insertRotaTaskSchema = createInsertSchema(rotaTasks).omit({ id: true, createdAt: true }).extend({
  day: z.enum(DAYS),
  frequency: z.enum(["daily", "weekly"]),
  startDate: isoDateString,
  personIds: z.array(z.string()).min(1, "At least one person is required"),
  intervalWeeks: z.coerce.number().int().min(1).max(52).default(1),
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
