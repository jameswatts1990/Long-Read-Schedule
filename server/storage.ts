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
  type Workspace,
  type InsertWorkspace,
  type WorkspaceUser,
  people,
  tasks,
  assignments,
  users,
  premadeFilters,
  workspaces,
  workspaceUsers,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
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
  getNextBatchId(workspaceId: string, prefix: string): Promise<string>;
  updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment>;
  deleteAssignment(id: string): Promise<void>;
  reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]>;

  // Premade Filters (scoped to workspace)
  getPremadeFilters(workspaceId: string): Promise<PremadeFilter[]>;
  createPremadeFilter(filter: InsertPremadeFilter): Promise<PremadeFilter>;
  updatePremadeFilter(id: string, data: Partial<InsertPremadeFilter>): Promise<PremadeFilter>;
  deletePremadeFilter(id: string): Promise<void>;
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
    const values = personIds.map((id, i) => sql`(${id}, ${i})`);
    await this.db.execute(sql`
      UPDATE ${people} AS p
      SET "order" = v.ord
      FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, ord)
      WHERE p.id = v.id
    `);
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
    const values = taskIds.map((id, i) => sql`(${id}, ${i})`);
    await this.db.execute(sql`
      UPDATE ${tasks} AS t
      SET "order" = v.ord
      FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, ord)
      WHERE t.id = v.id
    `);
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

  async getNextBatchId(workspaceId: string, prefix: string): Promise<string> {
    const normalizedPrefix = prefix.trim().toUpperCase();
    if (!normalizedPrefix) {
      throw new Error("Batch prefix is required");
    }

    const escapedPrefix = normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `^${escapedPrefix}-([0-9]+)$`;
    const result = await this.db.execute(sql`
      SELECT MAX((regexp_match(${assignments.batchNumber}, ${pattern}))[1]::int) AS "maxSeq"
      FROM ${assignments}
      WHERE ${assignments.workspaceId} = ${workspaceId}
        AND ${assignments.batchNumber} ~ ${pattern}
    `);

    const row = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    const maxSeq = typeof row?.maxSeq === "number" ? row.maxSeq : Number(row?.maxSeq ?? 0);
    const nextSeq = (Number.isFinite(maxSeq) ? maxSeq : 0) + 1;
    return `${normalizedPrefix}-${String(nextSeq).padStart(3, "0")}`;
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
    await this.db.delete(assignments).where(eq(assignments.id, id));
  }

  // Fix Issue 4: parallel updates instead of sequential awaits
  async reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]> {
    if (assignmentIds.length > 0) {
      const values = assignmentIds.map((id, i) => sql`(${id}, ${i})`);
      await this.db.execute(sql`
        UPDATE ${assignments} AS a
        SET "order" = v.ord
        FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, ord)
        WHERE a.id = v.id
      `);
    }
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
}

export const storage = new PostgresStorage();
