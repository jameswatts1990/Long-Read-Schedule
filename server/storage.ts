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
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, gte, lte } from "drizzle-orm";

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
}

export class PostgresStorage implements IStorage {
  private db;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const sql = neon(connectionString);
    this.db = drizzle(sql);
  }

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

  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const memberships = await this.db
      .select()
      .from(workspaceUsers)
      .where(eq(workspaceUsers.userId, userId));
    if (memberships.length === 0) return [];
    const wsIds = memberships.map(m => m.workspaceId);
    const all = await this.db.select().from(workspaces).orderBy(workspaces.createdAt);
    return all.filter(ws => wsIds.includes(ws.id));
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

  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const memberships = await this.db
      .select()
      .from(workspaceUsers)
      .where(eq(workspaceUsers.workspaceId, workspaceId));
    const result: WorkspaceMember[] = [];
    for (const m of memberships) {
      const user = await this.getUser(m.userId);
      if (user) result.push({ ...user, role: m.role });
    }
    return result;
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

  async updatePersonOrder(id: string, newOrder: number): Promise<Person> {
    const person = await this.getPerson(id);
    if (!person) throw new Error("Person not found");
    const oldOrder = person.order ?? 0;
    const allPeople = await this.getPeople(person.workspaceId);

    if (newOrder < oldOrder) {
      for (const p of allPeople) {
        const pOrder = p.order ?? 0;
        if (p.id !== id && pOrder >= newOrder && pOrder < oldOrder) {
          await this.db.update(people).set({ order: pOrder + 1 }).where(eq(people.id, p.id));
        }
      }
    } else if (newOrder > oldOrder) {
      for (const p of allPeople) {
        const pOrder = p.order ?? 0;
        if (p.id !== id && pOrder > oldOrder && pOrder <= newOrder) {
          await this.db.update(people).set({ order: pOrder - 1 }).where(eq(people.id, p.id));
        }
      }
    }

    const [updated] = await this.db.update(people).set({ order: newOrder }).where(eq(people.id, id)).returning();
    return updated;
  }

  async reorderPeople(personIds: string[]): Promise<Person[]> {
    for (let i = 0; i < personIds.length; i++) {
      await this.db.update(people).set({ order: i }).where(eq(people.id, personIds[i]));
    }
    if (personIds.length === 0) return [];
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

  async reorderTasks(taskIds: string[]): Promise<Task[]> {
    for (let i = 0; i < taskIds.length; i++) {
      await this.db.update(tasks).set({ order: i }).where(eq(tasks.id, taskIds[i]));
    }
    if (taskIds.length === 0) return [];
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
    await this.db.delete(assignments).where(eq(assignments.id, id));
  }

  async reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]> {
    for (let i = 0; i < assignmentIds.length; i++) {
      await this.db.update(assignments).set({ order: i }).where(eq(assignments.id, assignmentIds[i]));
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
