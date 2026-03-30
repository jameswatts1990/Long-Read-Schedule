import {
  type Person,
  type InsertPerson,
  type Task,
  type InsertTask,
  type Assignment,
  type InsertAssignment,
  type User,
  type UpsertUser,
  type PremadeFilter,
  type InsertPremadeFilter,
  type RotaTask,
  type InsertRotaTask,
  type Workspace,
  type InsertWorkspace,
  type WorkspaceUser,
  DAYS,
  people,
  tasks,
  assignments,
  users,
  premadeFilters,
  rotaTasks,
  rotaSkips,
  workspaces,
  workspaceUsers,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// Shared pool and db instance — reused by init-db.ts AND the session store
// to avoid opening multiple independent WebSocket clusters to Neon.
//
// max: 3  — default is 10; this single-server Node app needs far fewer.
// idleTimeoutMillis: 10_000  — close connections after 10 s idle so Neon
//   WebSocket keep-alive frames stop flowing during quiet periods.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");
export const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
export const sharedDb = drizzle(pool);

export interface WorkspaceMember extends User {
  role: string;
}

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUsers(): Promise<User[]>;

  // Workspace operations
  getWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  createWorkspace(data: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, data: Partial<InsertWorkspace>): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;
  getUserWorkspaces(userId: string): Promise<Workspace[]>;
  addUserToWorkspace(userId: string, workspaceId: string, role?: string): Promise<WorkspaceUser>;
  removeUserFromWorkspace(userId: string, workspaceId: string): Promise<void>;
  getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  getUserWorkspaceMembership(userId: string, workspaceId: string): Promise<WorkspaceUser | undefined>;

  // People (scoped to workspace)
  getPeople(workspaceId: string): Promise<Person[]>;
  getPerson(id: string): Promise<Person | undefined>;
  createPerson(person: InsertPerson): Promise<Person>;
  updatePerson(id: string, data: Partial<InsertPerson>): Promise<Person>;
  deletePerson(id: string): Promise<void>;
  updatePersonOrder(id: string, newOrder: number): Promise<Person>;
  reorderPeople(personIds: string[]): Promise<Person[]>;
  togglePersonExcluded(id: string): Promise<Person>;

  // Tasks (scoped to workspace)
  getTasks(workspaceId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  reorderTasks(taskIds: string[]): Promise<Task[]>;

  // Assignments (scoped to workspace)
  getAssignments(workspaceId: string): Promise<Assignment[]>;
  getAssignmentsByWeek(weekStartDate: string, workspaceId: string): Promise<Assignment[]>;
  getAssignmentsByDateRange(startDate: string, endDate: string, workspaceId: string): Promise<Assignment[]>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  getConflictingAssignments(personId: string, day: string, weekStartDate: string): Promise<Assignment[]>;
  createAssignment(assignment: InsertAssignment, createdById?: string): Promise<Assignment>;
  updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment>;
  deleteAssignment(id: string): Promise<void>;
  reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]>;

  // Premade Filters (scoped to workspace)
  getPremadeFilters(workspaceId: string): Promise<PremadeFilter[]>;
  createPremadeFilter(filter: InsertPremadeFilter): Promise<PremadeFilter>;
  updatePremadeFilter(id: string, data: Partial<InsertPremadeFilter>): Promise<PremadeFilter>;
  deletePremadeFilter(id: string): Promise<void>;

  // Rota tasks (scoped to workspace)
  getRotaTasks(workspaceId: string): Promise<RotaTask[]>;
  getRotaTask(id: string): Promise<RotaTask | undefined>;
  createRotaTask(task: InsertRotaTask): Promise<RotaTask>;
  updateRotaTask(id: string, data: Partial<InsertRotaTask>): Promise<RotaTask>;
  deleteRotaTask(id: string): Promise<void>;
  applyRotaTasksForWeek(workspaceId: string, weekStartDate: string): Promise<Assignment[]>;
  createRotaSkip(rotaTaskId: string, weekStartDate: string, day: string, workspaceId: string): Promise<void>;
}

export class PostgresStorage implements IStorage {
  private readonly db = sharedDb;

  // ─── User operations ───────────────────────────────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await this.db.select().from(users).orderBy(users.createdAt);
  }

  // ─── Workspace operations ──────────────────────────────────────────────────

  async getWorkspaces(): Promise<Workspace[]> {
    return await this.db.select().from(workspaces).orderBy(workspaces.createdAt);
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [ws] = await this.db.select().from(workspaces).where(eq(workspaces.id, id));
    return ws;
  }

  async createWorkspace(data: InsertWorkspace): Promise<Workspace> {
    const [ws] = await this.db.insert(workspaces).values(data).returning();
    return ws;
  }

  async updateWorkspace(id: string, data: Partial<InsertWorkspace>): Promise<Workspace> {
    const [ws] = await this.db.update(workspaces).set(data).where(eq(workspaces.id, id)).returning();
    return ws;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.db.delete(workspaceUsers).where(eq(workspaceUsers.workspaceId, id));
    await this.db.delete(premadeFilters).where(eq(premadeFilters.workspaceId, id));
    await this.db.delete(assignments).where(eq(assignments.workspaceId, id));
    await this.db.delete(rotaTasks).where(eq(rotaTasks.workspaceId, id));
    await this.db.delete(people).where(eq(people.workspaceId, id));
    await this.db.delete(tasks).where(eq(tasks.workspaceId, id));
    await this.db.delete(workspaces).where(eq(workspaces.id, id));
  }

  // Fix Issue 5: use SQL IN clause instead of fetching all then filtering in JS
  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const memberships = await this.db
      .select({ workspaceId: workspaceUsers.workspaceId })
      .from(workspaceUsers)
      .where(eq(workspaceUsers.userId, userId));
    if (memberships.length === 0) return [];
    const wsIds = memberships.map(m => m.workspaceId);
    return await this.db
      .select()
      .from(workspaces)
      .where(inArray(workspaces.id, wsIds))
      .orderBy(workspaces.createdAt);
  }

  async addUserToWorkspace(userId: string, workspaceId: string, role = "member"): Promise<WorkspaceUser> {
    const existing = await this.getUserWorkspaceMembership(userId, workspaceId);
    if (existing) return existing;
    const [membership] = await this.db
      .insert(workspaceUsers)
      .values({ userId, workspaceId, role })
      .returning();
    return membership;
  }

  async removeUserFromWorkspace(userId: string, workspaceId: string): Promise<void> {
    await this.db
      .delete(workspaceUsers)
      .where(and(eq(workspaceUsers.userId, userId), eq(workspaceUsers.workspaceId, workspaceId)));
  }

  // Fix Issue 3: single JOIN query instead of N+1 individual user lookups
  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        role: workspaceUsers.role,
      })
      .from(workspaceUsers)
      .innerJoin(users, eq(workspaceUsers.userId, users.id))
      .where(eq(workspaceUsers.workspaceId, workspaceId));
    return rows as WorkspaceMember[];
  }

  async getUserWorkspaceMembership(userId: string, workspaceId: string): Promise<WorkspaceUser | undefined> {
    const [m] = await this.db
      .select()
      .from(workspaceUsers)
      .where(and(eq(workspaceUsers.userId, userId), eq(workspaceUsers.workspaceId, workspaceId)));
    return m;
  }

  // ─── People ────────────────────────────────────────────────────────────────

  async getPeople(workspaceId: string): Promise<Person[]> {
    return await this.db
      .select()
      .from(people)
      .where(eq(people.workspaceId, workspaceId))
      .orderBy(people.order);
  }

  async getPerson(id: string): Promise<Person | undefined> {
    const [p] = await this.db.select().from(people).where(eq(people.id, id));
    return p;
  }

  async createPerson(insertPerson: InsertPerson): Promise<Person> {
    const workspaceId = insertPerson.workspaceId ?? "default";
    const existing = await this.getPeople(workspaceId);
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(p => p.order ?? 0)) : -1;
    const [p] = await this.db.insert(people).values({ ...insertPerson, order: maxOrder + 1 }).returning();
    return p;
  }

  async updatePerson(id: string, data: Partial<InsertPerson>): Promise<Person> {
    const [p] = await this.db.update(people).set(data).where(eq(people.id, id)).returning();
    return p;
  }

  async deletePerson(id: string): Promise<void> {
    await this.db.delete(people).where(eq(people.id, id));
  }

  // Fix Issue 10: simplified — updates only the target row's order, avoids shifting loop
  async updatePersonOrder(id: string, newOrder: number): Promise<Person> {
    const [updated] = await this.db.update(people).set({ order: newOrder }).where(eq(people.id, id)).returning();
    if (!updated) throw new Error("Person not found");
    return updated;
  }

  // Fix Issue 4: parallel updates instead of sequential awaits
  async reorderPeople(personIds: string[]): Promise<Person[]> {
    if (personIds.length === 0) return [];
    await Promise.all(
      personIds.map((id, i) => this.db.update(people).set({ order: i }).where(eq(people.id, id)))
    );
    const first = await this.getPerson(personIds[0]);
    return first ? await this.getPeople(first.workspaceId) : [];
  }

  async togglePersonExcluded(id: string): Promise<Person> {
    const person = await this.getPerson(id);
    if (!person) throw new Error("Person not found");
    const excluded = person.excluded ? 0 : 1;
    const [updated] = await this.db.update(people).set({ excluded }).where(eq(people.id, id)).returning();
    return updated;
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  async getTasks(workspaceId: string): Promise<Task[]> {
    return await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(tasks.order);
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [t] = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return t;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const workspaceId = insertTask.workspaceId ?? "default";
    const existing = await this.getTasks(workspaceId);
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(t => t.order ?? 0)) : -1;
    const [t] = await this.db.insert(tasks).values({ ...insertTask, order: maxOrder + 1 }).returning();
    return t;
  }

  async updateTask(id: string, data: Partial<InsertTask>): Promise<Task> {
    const [t] = await this.db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return t;
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  // Fix Issue 4: parallel updates instead of sequential awaits
  async reorderTasks(taskIds: string[]): Promise<Task[]> {
    if (taskIds.length === 0) return [];
    await Promise.all(
      taskIds.map((id, i) => this.db.update(tasks).set({ order: i }).where(eq(tasks.id, id)))
    );
    const first = await this.getTask(taskIds[0]);
    return first ? await this.getTasks(first.workspaceId) : [];
  }

  // ─── Assignments ───────────────────────────────────────────────────────────

  async getAssignments(workspaceId: string): Promise<Assignment[]> {
    return await this.db.select().from(assignments).where(eq(assignments.workspaceId, workspaceId));
  }

  async getAssignmentsByWeek(weekStartDate: string, workspaceId: string): Promise<Assignment[]> {
    const result = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.weekStartDate, weekStartDate), eq(assignments.workspaceId, workspaceId)));
    return result.sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)));
  }

  async getAssignmentsByDateRange(startDate: string, endDate: string, workspaceId: string): Promise<Assignment[]> {
    const result = await this.db
      .select()
      .from(assignments)
      .where(
        and(
          gte(assignments.weekStartDate, startDate),
          lte(assignments.weekStartDate, endDate),
          eq(assignments.workspaceId, workspaceId)
        )
      );
    return result.sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)));
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    const [a] = await this.db.select().from(assignments).where(eq(assignments.id, id));
    return a;
  }

  async getConflictingAssignments(personId: string, day: string, weekStartDate: string): Promise<Assignment[]> {
    const result = await this.db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.personId, personId),
          eq(assignments.day, day),
          eq(assignments.weekStartDate, weekStartDate)
        )
      );
    return result.sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)));
  }

  async createAssignment(insertAssignment: InsertAssignment, createdById?: string): Promise<Assignment> {
    const [a] = await this.db.insert(assignments).values({
      ...insertAssignment,
      batchNumber: insertAssignment.batchNumber || null,
      notes: insertAssignment.notes || null,
      date: insertAssignment.date || null,
      createdById: createdById || null,
    }).returning();
    return a;
  }

  async updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment> {
    const existing = await this.getAssignment(id);
    if (!existing) throw new Error("Assignment not found");

    const next: Partial<Assignment> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (key === "weekStartDate") {
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) continue;
        next.weekStartDate = trimmed;
        continue;
      }
      (next as any)[key] = value as any;
    }

    const [updated] = await this.db.update(assignments).set(next).where(eq(assignments.id, id)).returning();
    return updated;
  }

  async deleteAssignment(id: string): Promise<void> {
    // Before deleting, check if this is a rota-generated assignment.
    // If so, create a tombstone so applyRotaTasksForWeek won't recreate it.
    const [row] = await this.db
      .select({ rotaTaskId: assignments.rotaTaskId, weekStartDate: assignments.weekStartDate, day: assignments.day, workspaceId: assignments.workspaceId })
      .from(assignments)
      .where(eq(assignments.id, id))
      .limit(1);

    await this.db.delete(assignments).where(eq(assignments.id, id));

    if (row?.rotaTaskId) {
      await this.createRotaSkip(row.rotaTaskId, row.weekStartDate, row.day, row.workspaceId);
    }
  }

  // Fix Issue 4: parallel updates instead of sequential awaits
  async reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]> {
    await Promise.all(
      assignmentIds.map((id, i) => this.db.update(assignments).set({ order: i }).where(eq(assignments.id, id)))
    );
    return await this.getConflictingAssignments(personId, day, weekStartDate);
  }

  // ─── Premade Filters ───────────────────────────────────────────────────────

  async getPremadeFilters(workspaceId: string): Promise<PremadeFilter[]> {
    return await this.db.select().from(premadeFilters).where(eq(premadeFilters.workspaceId, workspaceId));
  }

  async createPremadeFilter(filter: InsertPremadeFilter): Promise<PremadeFilter> {
    const [f] = await this.db.insert(premadeFilters).values({
      name: filter.name,
      personIds: filter.personIds || [],
      taskIds: filter.taskIds || [],
      workspaceId: filter.workspaceId,
    }).returning();
    return f;
  }

  async updatePremadeFilter(id: string, data: Partial<InsertPremadeFilter>): Promise<PremadeFilter> {
    const updateData: Partial<InsertPremadeFilter> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.personIds !== undefined) updateData.personIds = data.personIds;
    if (data.taskIds !== undefined) updateData.taskIds = data.taskIds;

    const [f] = await this.db.update(premadeFilters).set(updateData).where(eq(premadeFilters.id, id)).returning();
    if (!f) throw new Error("Premade filter not found");
    return f;
  }

  async deletePremadeFilter(id: string): Promise<void> {
    await this.db.delete(premadeFilters).where(eq(premadeFilters.id, id));
  }

  // ─── Rota Tasks ───────────────────────────────────────────────────────────

  async getRotaTasks(workspaceId: string): Promise<RotaTask[]> {
    return await this.db
      .select()
      .from(rotaTasks)
      .where(eq(rotaTasks.workspaceId, workspaceId))
      .orderBy(rotaTasks.order);
  }

  async getRotaTask(id: string): Promise<RotaTask | undefined> {
    const [rotaTask] = await this.db.select().from(rotaTasks).where(eq(rotaTasks.id, id));
    return rotaTask;
  }

  async createRotaTask(insertTask: InsertRotaTask): Promise<RotaTask> {
    const workspaceId = insertTask.workspaceId ?? "default";
    const existing = await this.getRotaTasks(workspaceId);
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((t) => t.order ?? 0)) : -1;
    const [created] = await this.db
      .insert(rotaTasks)
      .values({ ...insertTask, order: maxOrder + 1 })
      .returning();
    return created;
  }

  async updateRotaTask(id: string, data: Partial<InsertRotaTask>): Promise<RotaTask> {
    const [updated] = await this.db.update(rotaTasks).set(data).where(eq(rotaTasks.id, id)).returning();
    return updated;
  }

  async deleteRotaTask(id: string): Promise<void> {
    await this.db.delete(rotaTasks).where(eq(rotaTasks.id, id));
  }

  // ─── Rota Application ─────────────────────────────────────────────────────
  //
  // For each rota task in the workspace, compute which person (if any) should
  // be assigned during `weekStartDate` and create any missing assignment rows.
  //
  // Idempotency strategy (two layers):
  //  1. rota_skips tombstones — created when the user explicitly deletes a
  //     rota-generated assignment; prevents recreation for the rest of time.
  //  2. Unique partial index + ON CONFLICT DO NOTHING on the DB insert — makes
  //     concurrent apply calls from multiple tabs/devices safe.
  async applyRotaTasksForWeek(workspaceId: string, weekStartDate: string): Promise<Assignment[]> {
    const allRotaTasks = await this.getRotaTasks(workspaceId);
    if (allRotaTasks.length === 0) return [];

    // Helper: return the Monday (00:00 UTC) of the week containing `date`
    const getMondayOf = (date: Date): Date => {
      const d = new Date(date);
      d.setUTCHours(0, 0, 0, 0);
      const dow = d.getUTCDay(); // 0=Sun … 6=Sat
      const diff = dow === 0 ? -6 : 1 - dow;
      d.setUTCDate(d.getUTCDate() + diff);
      return d;
    };

    const targetMonday = getMondayOf(new Date(`${weekStartDate}T00:00:00Z`));

    // Batch-load all tombstones for this workspace + week upfront to avoid N+1 queries.
    const skipRows = await this.db
      .select({ rotaTaskId: rotaSkips.rotaTaskId, day: rotaSkips.day })
      .from(rotaSkips)
      .where(
        and(
          eq(rotaSkips.workspaceId, workspaceId),
          eq(rotaSkips.weekStartDate, weekStartDate),
        ),
      );
    // Build a Set<"rotaTaskId:day"> for O(1) lookup
    const skipSet = new Set(skipRows.map((r) => `${r.rotaTaskId}:${r.day}`));

    const created: Assignment[] = [];

    for (const rotaTask of allRotaTasks) {
      if (rotaTask.personIds.length === 0) continue;

      const startMonday = getMondayOf(new Date(`${rotaTask.startDate}T00:00:00Z`));
      const diffMs = targetMonday.getTime() - startMonday.getTime();
      const weeksSinceStart = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));

      if (weeksSinceStart < 0) continue; // Rota hasn't started yet

      const intervalWeeks = rotaTask.intervalWeeks ?? 1;

      // Skip inactive weeks (Option A: gap between turns)
      if (weeksSinceStart % intervalWeeks !== 0) continue;

      const turnIndex = Math.floor(weeksSinceStart / intervalWeeks);
      const personId = rotaTask.personIds[turnIndex % rotaTask.personIds.length];

      // Daily cadence → assign all Mon-Fri; weekly → only the configured day
      const daysToAssign: string[] = rotaTask.frequency === "daily"
        ? [...DAYS]
        : [rotaTask.day];

      for (const day of daysToAssign) {
        // Layer 1: tombstone check — user explicitly deleted this slot
        if (skipSet.has(`${rotaTask.id}:${day}`)) continue;

        // Layer 2: atomic insert with ON CONFLICT DO NOTHING (unique index on
        // rota_task_id+week_start_date+day handles concurrent requests safely).
        const [newAssignment] = await this.db
          .insert(assignments)
          .values({
            id: randomUUID(),
            taskId: rotaTask.taskId,
            personId,
            day,
            weekStartDate,
            workspaceId,
            rotaTaskId: rotaTask.id,
          })
          .onConflictDoNothing()
          .returning();

        if (newAssignment) created.push(newAssignment);
      }
    }

    return created;
  }

  async createRotaSkip(rotaTaskId: string, weekStartDate: string, day: string, workspaceId: string): Promise<void> {
    await this.db
      .insert(rotaSkips)
      .values({ id: randomUUID(), rotaTaskId, weekStartDate, day, workspaceId })
      .onConflictDoNothing(); // idempotent — safe to call multiple times
  }
}

export const storage = new PostgresStorage();
