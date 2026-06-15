import {
  type Person,
  type InsertPerson,
  type Task,
  type InsertTask,
  type Instrument,
  type InsertInstrument,
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
  type Notification,
  type InsertNotification,
  type SiteAnnouncement,
  DAYS,
  people,
  tasks,
  instruments,
  assignments,
  users,
  premadeFilters,
  rotaTasks,
  rotaSkips,
  workspaces,
  workspaceUsers,
  notifications,
  siteAnnouncements,
  userNotificationSettings,
  type UserNotificationSettings,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, gte, lte, gt, inArray, isNull, isNotNull, sql, or } from "drizzle-orm";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");

// Main Drizzle pool — short idle timeout keeps WebSocket keep-alive frames
// low during quiet periods. All ORM queries use this pool.
export const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
export const sharedDb = drizzle(pool);

// Dedicated session pool — separate from the Drizzle pool so session reads
// don't compete with ORM queries for connections. Longer idle timeout keeps a
// connection alive between page requests so the session store never needs to
// reconnect mid-request (which caused intermittent 401s on the shared pool).
export const sessionPool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 60_000 });

export interface WorkspaceMember extends User {
  role: string;
}

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string): Promise<User>;

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
  getPeopleByUser(userId: string): Promise<Person[]>;
  findUnlinkedPersonByName(workspaceId: string, name: string): Promise<Person | undefined>;
  getPerson(id: string): Promise<Person | undefined>;
  findPersonByUserId(userId: string, workspaceId: string, excludePersonId?: string): Promise<Person | undefined>;
  createPerson(person: InsertPerson): Promise<Person>;
  updatePerson(id: string, data: Partial<InsertPerson>): Promise<Person>;
  deletePerson(id: string): Promise<void>;
  updatePersonOrder(id: string, newOrder: number): Promise<Person>;
  reorderPeople(personIds: string[]): Promise<Person[]>;
  togglePersonExcluded(id: string): Promise<Person>;
  updatePersonSlackUserId(id: string, slackUserId: string | null): Promise<Person>;

  // Tasks (scoped to workspace)
  getTasks(workspaceId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  reorderTasks(taskIds: string[]): Promise<Task[]>;

  // Instruments (scoped to workspace)
  getInstruments(workspaceId: string): Promise<Instrument[]>;
  getInstrument(id: string): Promise<Instrument | undefined>;
  createInstrument(instrument: InsertInstrument): Promise<Instrument>;
  updateInstrument(id: string, data: Partial<InsertInstrument>): Promise<Instrument>;
  deleteInstrument(id: string): Promise<void>;
  reorderInstruments(instrumentIds: string[]): Promise<Instrument[]>;

  // Assignments (scoped to workspace)
  getAssignments(workspaceId: string): Promise<Assignment[]>;
  getAssignmentsByWeek(weekStartDate: string, workspaceId: string): Promise<Assignment[]>;
  getAssignmentsByDateRange(startDate: string, endDate: string, workspaceId: string): Promise<Assignment[]>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  getConflictingAssignments(personId: string, day: string, weekStartDate: string): Promise<Assignment[]>;
  createAssignment(assignment: InsertAssignment, createdById?: string): Promise<Assignment>;
  updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment>;
  deleteAssignment(id: string): Promise<void>;
  deleteAssignmentsByTaskAndDate(taskId: string, workspaceId: string, afterDate?: string): Promise<{ deletedCount: number }>;
  reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]>;
  getTrainedPersonsByTask(taskId: string, workspaceId: string): Promise<string[]>;

  // Linked task groups (cards tied together as one logical piece of work)
  getAssignmentsByGroup(groupId: string, workspaceId: string): Promise<Assignment[]>;
  linkAssignments(assignmentIds: string[], workspaceId: string): Promise<{ groupId: string; assignments: Assignment[] }>;
  unlinkAssignment(assignmentId: string, workspaceId: string): Promise<void>;
  dissolveGroup(groupId: string, workspaceId: string): Promise<{ count: number }>;
  updateGroupFields(groupId: string, workspaceId: string, fields: Partial<Pick<Assignment, "batchNumber" | "batchSize" | "notes" | "customName" | "customColor" | "slackNotify" | "slackChangeNotify" | "instrumentIds">>): Promise<Assignment[]>;
  moveGroup(groupId: string, workspaceId: string, dayOffset: number, newPersonId?: string): Promise<{ ok: true; assignments: Assignment[] } | { ok: false; reason: string }>;
  deleteGroup(groupId: string, workspaceId: string): Promise<{ deleted: Assignment[] }>;

  // Slack notifications
  getTodaysSlackAssignments(): Promise<Array<{ taskName: string; personName: string; slackUserId: string }>>;
  isSlackUserIdRegistered(slackUserId: string): Promise<boolean>;
  getWeekAssignmentsForSlackUserId(slackUserId: string, weekStartDate: string): Promise<Array<{ day: string; taskName: string; taskColor: string; customName: string | null; batchNumber: string | null; batchSize: number | null; notes: string | null; workspaceName: string }>>;
  getPeopleWithSlackIdsForWeek(weekStartDate: string): Promise<string[]>;

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
  deleteRotaTask(id: string): Promise<{ deletedAssignments: number }>;
  applyRotaTasksForWeek(workspaceId: string, weekStartDate: string): Promise<Assignment[]>;
  createRotaSkip(rotaTaskId: string, weekStartDate: string, day: string, workspaceId: string): Promise<void>;

  // Notifications
  createNotification(data: InsertNotification): Promise<void>;
  getNotificationsForUser(userId: string, workspaceId: string): Promise<Notification[]>;
  markAllNotificationsRead(userId: string, workspaceId: string): Promise<void>;
  deleteNotification(id: string, userId: string): Promise<void>;

  // Site announcement operations
  getActiveSiteAnnouncement(): Promise<SiteAnnouncement | undefined>;
  getAllSiteAnnouncements(): Promise<SiteAnnouncement[]>;
  createSiteAnnouncement(data: { message: string; type: string; createdById: string; startsAt?: Date | null; expiresAt?: Date | null }): Promise<SiteAnnouncement>;
  updateSiteAnnouncement(id: string, data: { message: string; type: string; startsAt?: Date | null; expiresAt?: Date | null }): Promise<SiteAnnouncement>;
  activateSiteAnnouncement(id: string): Promise<SiteAnnouncement>;
  deactivateSiteAnnouncement(id: string): Promise<SiteAnnouncement>;
  deleteSiteAnnouncement(id: string): Promise<void>;
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

  async updateUserRole(userId: string, role: string): Promise<User> {
    const [updated] = await this.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
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
    await this.db.transaction(async (tx) => {
      await tx.delete(workspaceUsers).where(eq(workspaceUsers.workspaceId, id));
      await tx.delete(premadeFilters).where(eq(premadeFilters.workspaceId, id));
      await tx.delete(assignments).where(eq(assignments.workspaceId, id));
      await tx.delete(rotaTasks).where(eq(rotaTasks.workspaceId, id));
      await tx.delete(people).where(eq(people.workspaceId, id));
      await tx.delete(tasks).where(eq(tasks.workspaceId, id));
      await tx.delete(workspaces).where(eq(workspaces.id, id));
    });
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

  async getPeopleByUser(userId: string): Promise<Person[]> {
    return await this.db
      .select()
      .from(people)
      .where(eq(people.userId, userId))
      .orderBy(people.order);
  }

  async findUnlinkedPersonByName(workspaceId: string, name: string): Promise<Person | undefined> {
    const normalizedName = name.trim();
    if (!normalizedName) return undefined;

    const [person] = await this.db
      .select()
      .from(people)
      .where(
        and(
          eq(people.workspaceId, workspaceId),
          isNull(people.userId),
          sql`lower(${people.name}) = lower(${normalizedName})`,
        ),
      )
      .orderBy(people.order)
      .limit(1);

    return person;
  }

  async getPerson(id: string): Promise<Person | undefined> {
    const [p] = await this.db.select().from(people).where(eq(people.id, id));
    return p;
  }

  async findPersonByUserId(userId: string, workspaceId: string, excludePersonId?: string): Promise<Person | undefined> {
    const conditions = [eq(people.userId, userId), eq(people.workspaceId, workspaceId)];
    if (excludePersonId) conditions.push(sql`${people.id} != ${excludePersonId}`);
    const [p] = await this.db.select().from(people).where(and(...conditions));
    return p;
  }

  async createPerson(insertPerson: InsertPerson): Promise<Person> {
    const workspaceId = insertPerson.workspaceId ?? "default";
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${people.order}), -1)` })
      .from(people)
      .where(eq(people.workspaceId, workspaceId));
    const [p] = await this.db.insert(people).values({ ...insertPerson, order: max + 1 }).returning();
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

  async updatePersonSlackUserId(id: string, slackUserId: string | null): Promise<Person> {
    const [p] = await this.db.update(people).set({ slackUserId }).where(eq(people.id, id)).returning();
    if (!p) throw new Error("Person not found");
    return p;
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
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${tasks.order}), -1)` })
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId));
    const [t] = await this.db.insert(tasks).values({ ...insertTask, order: max + 1 }).returning();
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

  // ─── Instruments ───────────────────────────────────────────────────────────

  async getInstruments(workspaceId: string): Promise<Instrument[]> {
    return await this.db
      .select()
      .from(instruments)
      .where(eq(instruments.workspaceId, workspaceId))
      .orderBy(instruments.order);
  }

  async getInstrument(id: string): Promise<Instrument | undefined> {
    const [inst] = await this.db.select().from(instruments).where(eq(instruments.id, id));
    return inst;
  }

  async createInstrument(insertInstrument: InsertInstrument): Promise<Instrument> {
    const workspaceId = insertInstrument.workspaceId ?? "default";
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${instruments.order}), -1)` })
      .from(instruments)
      .where(eq(instruments.workspaceId, workspaceId));
    const [inst] = await this.db.insert(instruments).values({ ...insertInstrument, order: max + 1 }).returning();
    return inst;
  }

  async updateInstrument(id: string, data: Partial<InsertInstrument>): Promise<Instrument> {
    const [inst] = await this.db.update(instruments).set(data).where(eq(instruments.id, id)).returning();
    return inst;
  }

  async deleteInstrument(id: string): Promise<void> {
    // App-level remove: strip this instrument from any assignment that references it.
    await this.db
      .update(assignments)
      .set({ instrumentIds: sql`array_remove(${assignments.instrumentIds}, ${id})` })
      .where(sql`${id} = ANY(${assignments.instrumentIds})`);
    await this.db.delete(instruments).where(eq(instruments.id, id));
  }

  async reorderInstruments(instrumentIds: string[]): Promise<Instrument[]> {
    if (instrumentIds.length === 0) return [];
    await Promise.all(
      instrumentIds.map((id, i) => this.db.update(instruments).set({ order: i }).where(eq(instruments.id, id)))
    );
    const first = await this.getInstrument(instrumentIds[0]);
    return first ? await this.getInstruments(first.workspaceId) : [];
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

  async getTrainedPersonsByTask(taskId: string, workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ personId: assignments.personId })
      .from(assignments)
      .where(and(eq(assignments.taskId, taskId), eq(assignments.workspaceId, workspaceId)));
    return rows.map(r => r.personId);
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
      .select({ rotaTaskId: assignments.rotaTaskId, weekStartDate: assignments.weekStartDate, day: assignments.day, workspaceId: assignments.workspaceId, linkedGroupId: assignments.linkedGroupId })
      .from(assignments)
      .where(eq(assignments.id, id))
      .limit(1);

    await this.db.delete(assignments).where(eq(assignments.id, id));

    if (row?.rotaTaskId) {
      await this.createRotaSkip(row.rotaTaskId, row.weekStartDate, row.day, row.workspaceId);
    }
    if (row?.linkedGroupId) {
      await this.dissolveSingletonGroups(row.workspaceId, [row.linkedGroupId]);
    }
  }

  async deleteAssignmentSeries(seriesId: string, workspaceId: string): Promise<{ deletedCount: number }> {
    const deleted = await this.db
      .delete(assignments)
      .where(and(eq(assignments.seriesId, seriesId), eq(assignments.workspaceId, workspaceId)))
      .returning({
        id: assignments.id,
        rotaTaskId: assignments.rotaTaskId,
        weekStartDate: assignments.weekStartDate,
        day: assignments.day,
        workspaceId: assignments.workspaceId,
        linkedGroupId: assignments.linkedGroupId,
      });
    // Tombstone any rota-generated rows so rota re-apply won't recreate them
    // (same guarantee deleteAssignment gives for single deletes).
    for (const row of deleted) {
      if (row.rotaTaskId) {
        await this.createRotaSkip(row.rotaTaskId, row.weekStartDate, row.day, row.workspaceId);
      }
    }
    await this.dissolveSingletonGroups(workspaceId, deleted.map((d) => d.linkedGroupId));
    return { deletedCount: deleted.length };
  }

  async deleteAssignmentsByTaskAndDate(taskId: string, workspaceId: string, afterDate?: string): Promise<{ deletedCount: number }> {
    const whereConditions = [eq(assignments.taskId, taskId), eq(assignments.workspaceId, workspaceId)];
    if (afterDate) {
      whereConditions.push(gte(assignments.weekStartDate, afterDate));
    }

    const deleted = await this.db
      .delete(assignments)
      .where(and(...whereConditions))
      .returning({ id: assignments.id });

    return { deletedCount: deleted.length };
  }

  // Fix Issue 4: parallel updates instead of sequential awaits
  async reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]> {
    await Promise.all(
      assignmentIds.map((id, i) => this.db.update(assignments).set({ order: i }).where(eq(assignments.id, id)))
    );
    return await this.getConflictingAssignments(personId, day, weekStartDate);
  }

  // ─── Linked task groups ────────────────────────────────────────────────────

  // Invariant: a group always has >= 2 members. Any operation that can shrink a
  // group calls this to null out groups left with a single member.
  private async dissolveSingletonGroups(workspaceId: string, groupIds: Array<string | null>): Promise<void> {
    const candidates = Array.from(new Set(groupIds.filter((g): g is string => !!g)));
    if (candidates.length === 0) return;
    const counts = await this.db
      .select({ groupId: assignments.linkedGroupId, n: sql<number>`count(*)` })
      .from(assignments)
      .where(and(eq(assignments.workspaceId, workspaceId), inArray(assignments.linkedGroupId, candidates)))
      .groupBy(assignments.linkedGroupId);
    const singletons = counts.filter((c) => Number(c.n) === 1).map((c) => c.groupId!);
    if (singletons.length === 0) return;
    await this.db
      .update(assignments)
      .set({ linkedGroupId: null })
      .where(and(eq(assignments.workspaceId, workspaceId), inArray(assignments.linkedGroupId, singletons)));
  }

  async getAssignmentsByGroup(groupId: string, workspaceId: string): Promise<Assignment[]> {
    return await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.linkedGroupId, groupId), eq(assignments.workspaceId, workspaceId)));
  }

  async linkAssignments(assignmentIds: string[], workspaceId: string): Promise<{ groupId: string; assignments: Assignment[] }> {
    const ids = Array.from(new Set(assignmentIds));
    const rows = await this.db
      .select({ id: assignments.id, linkedGroupId: assignments.linkedGroupId })
      .from(assignments)
      .where(and(inArray(assignments.id, ids), eq(assignments.workspaceId, workspaceId)));
    if (rows.length !== ids.length) {
      throw new Error("One or more selected assignments no longer exist");
    }
    // Members pulled out of an existing group must not leave a 1-card group behind.
    const previousGroupIds = rows.map((r) => r.linkedGroupId);
    const groupId = randomUUID();
    const updated = await this.db
      .update(assignments)
      .set({ linkedGroupId: groupId, updatedAt: new Date() })
      .where(and(inArray(assignments.id, ids), eq(assignments.workspaceId, workspaceId)))
      .returning();
    await this.dissolveSingletonGroups(workspaceId, previousGroupIds);
    return { groupId, assignments: updated };
  }

  async unlinkAssignment(assignmentId: string, workspaceId: string): Promise<void> {
    const [row] = await this.db
      .select({ linkedGroupId: assignments.linkedGroupId })
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.workspaceId, workspaceId)))
      .limit(1);
    if (!row) throw new Error("Assignment not found");
    if (!row.linkedGroupId) return;
    await this.db
      .update(assignments)
      .set({ linkedGroupId: null, updatedAt: new Date() })
      .where(eq(assignments.id, assignmentId));
    await this.dissolveSingletonGroups(workspaceId, [row.linkedGroupId]);
  }

  async dissolveGroup(groupId: string, workspaceId: string): Promise<{ count: number }> {
    const updated = await this.db
      .update(assignments)
      .set({ linkedGroupId: null, updatedAt: new Date() })
      .where(and(eq(assignments.linkedGroupId, groupId), eq(assignments.workspaceId, workspaceId)))
      .returning({ id: assignments.id });
    return { count: updated.length };
  }

  async updateGroupFields(
    groupId: string,
    workspaceId: string,
    fields: Partial<Pick<Assignment, "batchNumber" | "batchSize" | "notes" | "customName" | "customColor" | "slackNotify" | "slackChangeNotify" | "instrumentIds">>,
  ): Promise<Assignment[]> {
    const next: Partial<Assignment> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      (next as any)[key] = value;
    }
    return await this.db
      .update(assignments)
      .set(next)
      .where(and(eq(assignments.linkedGroupId, groupId), eq(assignments.workspaceId, workspaceId)))
      .returning();
  }

  async moveGroup(
    groupId: string,
    workspaceId: string,
    dayOffset: number,
    newPersonId?: string,
  ): Promise<{ ok: true; assignments: Assignment[] } | { ok: false; reason: string }> {
    const members = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.linkedGroupId, groupId), eq(assignments.workspaceId, workspaceId)));
    if (members.length === 0) return { ok: false, reason: "Linked group not found" };

    // Validate every member's destination before touching anything so the
    // move is all-or-nothing. Offsets are relative to each member's own date,
    // preserving the group's internal spacing even across weeks.
    const moves: Array<{ id: string; day: string; weekStartDate: string; date: string | null }> = [];
    for (const m of members) {
      const dayIndex = DAYS.indexOf(m.day as (typeof DAYS)[number]);
      if (dayIndex === -1) return { ok: false, reason: `Assignment has an unrecognised day "${m.day}"` };
      // weekStartDate is always a UTC Monday; UTC methods avoid DST drift.
      const target = new Date(`${m.weekStartDate}T00:00:00Z`);
      target.setUTCDate(target.getUTCDate() + dayIndex + dayOffset);
      const dow = target.getUTCDay(); // 0=Sun … 6=Sat
      if (dow === 0 || dow === 6) {
        return { ok: false, reason: `Moving the group would land the ${m.day} card on a weekend` };
      }
      const monday = new Date(target);
      monday.setUTCDate(target.getUTCDate() - (dow - 1));
      moves.push({
        id: m.id,
        day: DAYS[dow - 1],
        weekStartDate: monday.toISOString().slice(0, 10),
        date: m.date ? target.toISOString().slice(0, 10) : null,
      });
    }

    await Promise.all(
      moves.map((mv) =>
        this.db
          .update(assignments)
          .set({
            day: mv.day,
            weekStartDate: mv.weekStartDate,
            ...(mv.date !== null ? { date: mv.date } : {}),
            ...(newPersonId ? { personId: newPersonId } : {}),
            updatedAt: new Date(),
          })
          .where(eq(assignments.id, mv.id)),
      ),
    );

    const updated = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.linkedGroupId, groupId), eq(assignments.workspaceId, workspaceId)));
    return { ok: true, assignments: updated };
  }

  async deleteGroup(groupId: string, workspaceId: string): Promise<{ deleted: Assignment[] }> {
    const deleted = await this.db
      .delete(assignments)
      .where(and(eq(assignments.linkedGroupId, groupId), eq(assignments.workspaceId, workspaceId)))
      .returning();
    // Tombstone rota-generated members so rota re-apply won't recreate them.
    for (const row of deleted) {
      if (row.rotaTaskId) {
        await this.createRotaSkip(row.rotaTaskId, row.weekStartDate, row.day, row.workspaceId);
      }
    }
    return { deleted };
  }

  // ─── Slack Notifications ───────────────────────────────────────────────────

  async getTodaysSlackAssignments(): Promise<Array<{ taskName: string; personName: string; slackUserId: string }>> {
    // Compute today's weekStartDate (Monday, UTC) and day name
    const now = new Date();
    const dow = now.getUTCDay(); // 0=Sun … 6=Sat
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);
    const weekStartDate = monday.toISOString().slice(0, 10);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayName = dayNames[now.getUTCDay()];

    const rows = await this.db
      .select({
        taskName: tasks.name,
        personName: people.name,
        slackUserId: people.slackUserId,
      })
      .from(assignments)
      .innerJoin(tasks, eq(assignments.taskId, tasks.id))
      .innerJoin(people, eq(assignments.personId, people.id))
      .leftJoin(userNotificationSettings, eq(people.userId, userNotificationSettings.userId))
      .where(
        and(
          eq(assignments.slackNotify, 1),
          eq(assignments.weekStartDate, weekStartDate),
          eq(assignments.day, todayName),
          isNotNull(people.slackUserId),
          or(
            isNull(people.userId),
            isNull(userNotificationSettings.userId),
            eq(userNotificationSettings.dailyReminder, 1),
          ),
        ),
      );

    return rows.filter((r): r is { taskName: string; personName: string; slackUserId: string } =>
      r.slackUserId !== null,
    );
  }

  async isSlackUserIdRegistered(slackUserId: string): Promise<boolean> {
    const rows = await this.db.select({ id: people.id }).from(people).where(eq(people.slackUserId, slackUserId)).limit(1);
    return rows.length > 0;
  }

  async getWeekAssignmentsForSlackUserId(
    slackUserId: string,
    weekStartDate: string,
  ): Promise<Array<{ day: string; taskName: string; taskColor: string; customName: string | null; batchNumber: string | null; batchSize: number | null; notes: string | null; workspaceName: string }>> {
    return await this.db
      .select({
        day: assignments.day,
        taskName: tasks.name,
        taskColor: tasks.color,
        customName: assignments.customName,
        batchNumber: assignments.batchNumber,
        batchSize: assignments.batchSize,
        notes: assignments.notes,
        workspaceName: workspaces.name,
      })
      .from(assignments)
      .innerJoin(tasks, eq(assignments.taskId, tasks.id))
      .innerJoin(people, eq(assignments.personId, people.id))
      .innerJoin(workspaces, eq(assignments.workspaceId, workspaces.id))
      .where(
        and(
          eq(people.slackUserId, slackUserId),
          eq(assignments.weekStartDate, weekStartDate),
        ),
      );
  }

  async getPeopleWithSlackIdsForWeek(weekStartDate: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ slackUserId: people.slackUserId })
      .from(assignments)
      .innerJoin(people, eq(assignments.personId, people.id))
      .leftJoin(userNotificationSettings, eq(people.userId, userNotificationSettings.userId))
      .where(
        and(
          eq(assignments.weekStartDate, weekStartDate),
          isNotNull(people.slackUserId),
          or(
            isNull(people.userId),
            isNull(userNotificationSettings.userId),
            eq(userNotificationSettings.weeklyPreview, 1),
          ),
        ),
      );
    return rows.map((r) => r.slackUserId).filter((id): id is string => id !== null);
  }

  // ─── User Notification Settings ───────────────────────────────────────────

  async getNotificationSettings(userId: string): Promise<{ dailyReminder: number; weeklyPreview: number }> {
    const rows = await this.db
      .select({ dailyReminder: userNotificationSettings.dailyReminder, weeklyPreview: userNotificationSettings.weeklyPreview })
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, userId));
    return rows[0] ?? { dailyReminder: 1, weeklyPreview: 1 };
  }

  async upsertNotificationSettings(userId: string, settings: { dailyReminder: number; weeklyPreview: number }): Promise<void> {
    await this.db
      .insert(userNotificationSettings)
      .values({ userId, ...settings })
      .onConflictDoUpdate({
        target: userNotificationSettings.userId,
        set: { ...settings, updatedAt: new Date() },
      });
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

  async getRotaTask(id: string, workspaceId?: string): Promise<RotaTask | undefined> {
    const conditions = workspaceId
      ? and(eq(rotaTasks.id, id), eq(rotaTasks.workspaceId, workspaceId))
      : eq(rotaTasks.id, id);
    const [rotaTask] = await this.db.select().from(rotaTasks).where(conditions);
    return rotaTask;
  }

  async createRotaTask(insertTask: InsertRotaTask): Promise<RotaTask> {
    const workspaceId = insertTask.workspaceId ?? "default";
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${rotaTasks.order}), -1)` })
      .from(rotaTasks)
      .where(eq(rotaTasks.workspaceId, workspaceId));
    const [created] = await this.db
      .insert(rotaTasks)
      .values({ ...insertTask, order: max + 1 })
      .returning();
    return created;
  }

  async updateRotaTask(id: string, data: Partial<InsertRotaTask>): Promise<RotaTask> {
    const [updated] = await this.db.update(rotaTasks).set(data).where(eq(rotaTasks.id, id)).returning();
    return updated;
  }

  async deleteRotaTask(id: string): Promise<{ deletedAssignments: number }> {
    return await this.db.transaction(async (tx) => {
      const deletedAssignmentsRows = await tx
        .delete(assignments)
        .where(eq(assignments.rotaTaskId, id))
        .returning({ id: assignments.id });
      await tx.delete(rotaSkips).where(eq(rotaSkips.rotaTaskId, id));
      await tx.delete(rotaTasks).where(eq(rotaTasks.id, id));
      return { deletedAssignments: deletedAssignmentsRows.length };
    });
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
    const activeRotaTasks = allRotaTasks.filter((task) => !task.archivedAt);
    if (activeRotaTasks.length === 0) return [];

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

    for (const rotaTask of activeRotaTasks) {
      try {
        if (rotaTask.personIds.length === 0) continue;

        const startMonday = getMondayOf(new Date(`${rotaTask.startDate}T00:00:00Z`));
        const diffMs = targetMonday.getTime() - startMonday.getTime();
        const weeksSinceStart = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));

        if (weeksSinceStart < 0) continue; // Rota hasn't started yet

        const intervalWeeks = rotaTask.intervalWeeks ?? 1;

        // Skip inactive weeks (Option A: gap between turns)
        if (weeksSinceStart % intervalWeeks !== 0) continue;

        const weekLimit = rotaTask.weekLimit;
        // Calculate how many active weeks have passed (0-indexed, so active week count is turnIndex + 1)
        const turnIndex = Math.floor(weeksSinceStart / intervalWeeks);
        const activeWeekCount = turnIndex + 1;

        if (weekLimit != null && activeWeekCount > weekLimit) {
          await this.db
            .update(rotaTasks)
            .set({ archivedAt: new Date() })
            .where(and(eq(rotaTasks.id, rotaTask.id), isNull(rotaTasks.archivedAt)));
          continue;
        }

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

          if (newAssignment) {
            created.push(newAssignment);
          }
        }
      } catch (err) {
        console.error(`Failed to apply rota task ${rotaTask.id} for week ${weekStartDate}:`, err);
        // Continue with remaining rota tasks rather than failing the entire request
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

  // ─── Notifications ─────────────────────────────────────────────────────────

  async createNotification(data: InsertNotification): Promise<void> {
    await this.db.insert(notifications).values(data);
  }

  async getNotificationsForUser(userId: string, workspaceId: string): Promise<Notification[]> {
    return this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId)))
      .orderBy(sql`${notifications.createdAt} DESC`)
      .limit(50);
  }

  async markAllNotificationsRead(userId: string, workspaceId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.workspaceId, workspaceId),
          isNull(notifications.readAt)
        )
      );
  }

  async deleteNotification(id: string, userId: string): Promise<void> {
    await this.db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async getActiveSiteAnnouncement(): Promise<SiteAnnouncement | undefined> {
    const now = new Date();
    const [row] = await this.db
      .select()
      .from(siteAnnouncements)
      .where(
        and(
          eq(siteAnnouncements.isActive, 1),
          or(isNull(siteAnnouncements.startsAt), lte(siteAnnouncements.startsAt, now)),
          or(isNull(siteAnnouncements.expiresAt), gt(siteAnnouncements.expiresAt, now)),
        )
      )
      .limit(1);
    return row;
  }

  async getAllSiteAnnouncements(): Promise<SiteAnnouncement[]> {
    return this.db
      .select()
      .from(siteAnnouncements)
      .orderBy(siteAnnouncements.createdAt);
  }

  async createSiteAnnouncement(data: { message: string; type: string; createdById: string; startsAt?: Date | null; expiresAt?: Date | null }): Promise<SiteAnnouncement> {
    const { message, type, createdById, startsAt = null, expiresAt = null } = data;
    // Deactivate-all and insert are wrapped in a transaction so a failed INSERT
    // doesn't leave the user with no active announcement.
    const [row] = await this.db.transaction(async (tx) => {
      await tx.update(siteAnnouncements).set({ isActive: 0 });
      return tx
        .insert(siteAnnouncements)
        .values({ id: randomUUID(), message, type, createdById, isActive: 1, startsAt, expiresAt })
        .returning();
    });
    return row;
  }

  async updateSiteAnnouncement(id: string, data: { message: string; type: string; startsAt?: Date | null; expiresAt?: Date | null }): Promise<SiteAnnouncement> {
    const { message, type, startsAt = null, expiresAt = null } = data;
    const [row] = await this.db
      .update(siteAnnouncements)
      .set({ message, type, startsAt, expiresAt })
      .where(eq(siteAnnouncements.id, id))
      .returning();
    return row;
  }

  async activateSiteAnnouncement(id: string): Promise<SiteAnnouncement> {
    // Deactivate all, then activate the target — kept in one round trip via two statements
    await this.db.update(siteAnnouncements).set({ isActive: 0 });
    const [row] = await this.db
      .update(siteAnnouncements)
      .set({ isActive: 1 })
      .where(eq(siteAnnouncements.id, id))
      .returning();
    return row;
  }

  async deactivateSiteAnnouncement(id: string): Promise<SiteAnnouncement> {
    const [row] = await this.db
      .update(siteAnnouncements)
      .set({ isActive: 0 })
      .where(eq(siteAnnouncements.id, id))
      .returning();
    return row;
  }

  async deleteSiteAnnouncement(id: string): Promise<void> {
    await this.db.delete(siteAnnouncements).where(eq(siteAnnouncements.id, id));
  }
}

export const storage = new PostgresStorage();
