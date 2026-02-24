import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
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

export const people = pgTable("people", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull(),
  order: integer("order").default(0),
  excluded: integer("excluded").default(0),
  userId: varchar("user_id"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdById: varchar("created_by_id"),
});

export const premadeFilters = pgTable("premade_filters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  personIds: text("person_ids").array().notNull().default([]),
  taskIds: text("task_ids").array().notNull().default([]),
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
