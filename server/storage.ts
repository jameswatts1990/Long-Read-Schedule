import {
  type Person,
  type InsertPerson,
  type Task,
  type InsertTask,
  type Assignment,
  type InsertAssignment,
  type User,
  type UpsertUser,
  people,
  tasks,
  assignments,
  users,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  getPeople(): Promise<Person[]>;
  getPerson(id: string): Promise<Person | undefined>;
  createPerson(person: InsertPerson): Promise<Person>;
  updatePerson(id: string, data: Partial<InsertPerson>): Promise<Person>;
  deletePerson(id: string): Promise<void>;
  updatePersonOrder(id: string, newOrder: number): Promise<Person>;
  reorderPeople(personIds: string[]): Promise<Person[]>;
  togglePersonExcluded(id: string): Promise<Person>;

  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  reorderTasks(taskIds: string[]): Promise<Task[]>;

  getAssignments(): Promise<Assignment[]>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  getConflictingAssignments(personId: string, day: string, weekStartDate: string): Promise<Assignment[]>;
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment>;
  deleteAssignment(id: string): Promise<void>;
  reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]>;
}

export class MemStorage implements IStorage {
  private people: Map<string, Person>;
  private tasks: Map<string, Task>;
  private assignments: Map<string, Assignment>;
  private users: Map<string, User>;

  constructor() {
    this.people = new Map();
    this.tasks = new Map();
    this.assignments = new Map();
    this.users = new Map();
    
    this.initializeSampleData();
  }

  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const now = new Date();
    const existing = this.users.get(userData.id!);
    const user: User = {
      ...userData,
      id: userData.id!,
      email: userData.email ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  private initializeSampleData() {
    const samplePeople = [
      { name: "Dr. Sarah Chen", color: "#3B82F6" },
      { name: "James Rodriguez", color: "#10B981" },
      { name: "Emily Watson", color: "#F59E0B" },
    ];

    const sampleTasks = [
      { name: "Cell Culture Prep", color: "#DBEAFE", description: "Prepare cell culture media and plates" },
      { name: "PCR Analysis", color: "#D1FAE5", description: "Run PCR amplification and gel analysis" },
      { name: "Sample Collection", color: "#FEF3C7", description: "Collect and process samples" },
      { name: "Equipment Maintenance", color: "#E0E7FF", description: "Regular equipment calibration and cleaning" },
    ];

    const peopleIds: string[] = [];
    samplePeople.forEach((p, index) => {
      const id = randomUUID();
      this.people.set(id, { id, ...p, order: index } as any);
      peopleIds.push(id);
    });

    const taskIds: string[] = [];
    sampleTasks.forEach((t, index) => {
      const id = randomUUID();
      this.tasks.set(id, { id, ...t, order: index } as any);
      taskIds.push(id);
    });

    const getMonday = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    };

    const formatDate = (date: Date): string => {
      return date.toISOString().split("T")[0];
    };

    const currentWeekStart = formatDate(getMonday(new Date()));

    const sampleAssignments: InsertAssignment[] = [
      {
        taskId: taskIds[0],
        personId: peopleIds[0],
        day: "Monday",
        weekStartDate: currentWeekStart,
        batchNumber: "B-2024-001",
        notes: null,
        date: null,
      },
      {
        taskId: taskIds[1],
        personId: peopleIds[0],
        day: "Monday",
        weekStartDate: currentWeekStart,
        batchNumber: null,
        notes: null,
        date: null,
      },
      {
        taskId: taskIds[0],
        personId: peopleIds[1],
        day: "Tuesday",
        weekStartDate: currentWeekStart,
        batchNumber: "B-2024-002",
        notes: "Priority sample",
        date: null,
      },
      {
        taskId: taskIds[2],
        personId: peopleIds[2],
        day: "Wednesday",
        weekStartDate: currentWeekStart,
        batchNumber: null,
        notes: null,
        date: null,
      },
    ];

    sampleAssignments.forEach((a) => {
      const id = randomUUID();
      this.assignments.set(id, {
        id,
        ...a,
      });
    });
  }

  async getPeople(): Promise<Person[]> {
    return Array.from(this.people.values()).sort((a, b) => {
      const orderA = (a as any).order ?? 0;
      const orderB = (b as any).order ?? 0;
      return orderA - orderB;
    });
  }

  async getPerson(id: string): Promise<Person | undefined> {
    return this.people.get(id);
  }

  async createPerson(insertPerson: InsertPerson): Promise<Person> {
    const id = randomUUID();
    const order = this.people.size;
    const person: Person = { ...insertPerson, id, order } as any;
    this.people.set(id, person);
    return person;
  }

  async updatePerson(id: string, data: Partial<InsertPerson>): Promise<Person> {
    const existing = this.people.get(id);
    if (!existing) throw new Error("Person not found");
    const updated: Person = { ...existing, ...data };
    this.people.set(id, updated);
    return updated;
  }

  async deletePerson(id: string): Promise<void> {
    this.people.delete(id);
  }

  async updatePersonOrder(id: string, newOrder: number): Promise<Person> {
    const person = this.people.get(id);
    if (!person) throw new Error("Person not found");
    const oldOrder = (person as any).order ?? 0;
    const allPeople = Array.from(this.people.values()).map(p => ({
      ...p,
      order: (p as any).order ?? 0
    }));

    if (newOrder < oldOrder) {
      allPeople.forEach(p => {
        if (p.id !== id && p.order >= newOrder && p.order < oldOrder) {
          (p as any).order += 1;
        }
      });
    } else if (newOrder > oldOrder) {
      allPeople.forEach(p => {
        if (p.id !== id && p.order > oldOrder && p.order <= newOrder) {
          (p as any).order -= 1;
        }
      });
    }

    allPeople.forEach(p => {
      this.people.set(p.id, { ...p, order: p.order } as Person);
    });

    const updated = this.people.get(id)!;
    return updated;
  }

  async reorderPeople(personIds: string[]): Promise<Person[]> {
    personIds.forEach((id, index) => {
      const person = this.people.get(id);
      if (person) {
        this.people.set(id, { ...person, order: index } as any);
      }
    });
    return await this.getPeople();
  }

  async togglePersonExcluded(id: string): Promise<Person> {
    const person = this.people.get(id);
    if (!person) throw new Error("Person not found");
    const excluded = (person as any).excluded ? 0 : 1;
    const updated = { ...person, excluded } as any;
    this.people.set(id, updated);
    return updated;
  }

  async getTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values()).sort((a, b) => {
      const orderA = (a as any).order ?? 0;
      const orderB = (b as any).order ?? 0;
      return orderA - orderB;
    });
  }

  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const order = this.tasks.size;
    const task: Task = { ...insertTask, id, order } as any;
    this.tasks.set(id, task);
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async reorderTasks(taskIds: string[]): Promise<Task[]> {
    taskIds.forEach((id, index) => {
      const task = this.tasks.get(id);
      if (task) {
        this.tasks.set(id, { ...task, order: index } as any);
      }
    });
    return await this.getTasks();
  }

  async getAssignments(): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).sort((a, b) => {
      const orderA = (a as any).order ?? 0;
      const orderB = (b as any).order ?? 0;
      return orderA - orderB;
    });
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    return this.assignments.get(id);
  }

  async getConflictingAssignments(personId: string, day: string, weekStartDate: string): Promise<Assignment[]> {
    return Array.from(this.assignments.values())
      .filter(
        a => a.personId === personId &&
             a.day === day &&
             a.weekStartDate === weekStartDate
      )
      .sort((a, b) => {
        const orderA = (a as any).order ?? 0;
        const orderB = (b as any).order ?? 0;
        return orderA - orderB;
      });
  }

  async createAssignment(insertAssignment: InsertAssignment): Promise<Assignment> {
    const id = randomUUID();
    const cellAssignments = Array.from(this.assignments.values()).filter(
      a => a.personId === insertAssignment.personId &&
           a.day === insertAssignment.day &&
           a.weekStartDate === insertAssignment.weekStartDate
    );
    const order = cellAssignments.length;
    const assignment: Assignment = {
      id,
      ...insertAssignment,
      batchNumber: insertAssignment.batchNumber || null,
      notes: insertAssignment.notes || null,
      date: insertAssignment.date || null,
      order,
    } as any;
    this.assignments.set(id, assignment);
    return assignment;
  }

  async reorderAssignmentsByCell(personId: string, day: string, weekStartDate: string, assignmentIds: string[]): Promise<Assignment[]> {
    const assignments = Array.from(this.assignments.values()).filter(
      a => a.personId === personId &&
           a.day === day &&
           a.weekStartDate === weekStartDate
    );
    
    assignmentIds.forEach((id, index) => {
      const assignment = assignments.find(a => a.id === id);
      if (assignment) {
        const updated = { ...assignment, order: index } as any;
        this.assignments.set(id, updated);
      }
    });
    
    return this.getConflictingAssignments(personId, day, weekStartDate);
  }

  async updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment> {
    const existing = this.assignments.get(id);
    if (!existing) throw new Error("Assignment not found");

    const next: Assignment = { ...existing };
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (key === "weekStartDate") {
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) continue;
        next.weekStartDate = trimmed;
        continue;
      }
      next[key as keyof Assignment] = value as Assignment[keyof Assignment];
    }

    this.assignments.set(id, next);
    return next;
  }

  async deleteAssignment(id: string): Promise<void> {
    this.assignments.delete(id);
  }
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

  // User operations (required for Replit Auth)
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
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getPeople(): Promise<Person[]> {
    const result = await this.db.select().from(people).orderBy(people.order);
    return result;
  }

  async getPerson(id: string): Promise<Person | undefined> {
    const result = await this.db.select().from(people).where(eq(people.id, id));
    return result[0];
  }

  async createPerson(insertPerson: InsertPerson): Promise<Person> {
    const allPeople = await this.db.select().from(people);
    const maxOrder = allPeople.length > 0 ? Math.max(...allPeople.map(p => p.order ?? 0)) : -1;
    const result = await this.db.insert(people).values({ ...insertPerson, order: maxOrder + 1 }).returning();
    return result[0];
  }

  async updatePerson(id: string, data: Partial<InsertPerson>): Promise<Person> {
    const result = await this.db
      .update(people)
      .set(data)
      .where(eq(people.id, id))
      .returning();
    return result[0];
  }

  async deletePerson(id: string): Promise<void> {
    await this.db.delete(people).where(eq(people.id, id));
  }

  async updatePersonOrder(id: string, newOrder: number): Promise<Person> {
    const person = await this.getPerson(id);
    if (!person) throw new Error("Person not found");
    
    const oldOrder = person.order ?? 0;
    const allPeople = await this.db.select().from(people);

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

    const result = await this.db.update(people).set({ order: newOrder }).where(eq(people.id, id)).returning();
    return result[0];
  }

  async reorderPeople(personIds: string[]): Promise<Person[]> {
    for (let i = 0; i < personIds.length; i++) {
      await this.db.update(people).set({ order: i }).where(eq(people.id, personIds[i]));
    }
    return await this.getPeople();
  }

  async togglePersonExcluded(id: string): Promise<Person> {
    const person = await this.getPerson(id);
    if (!person) throw new Error("Person not found");
    const excluded = (person.excluded ? 0 : 1);
    const result = await this.db
      .update(people)
      .set({ excluded })
      .where(eq(people.id, id))
      .returning();
    return result[0];
  }

  async getTasks(): Promise<Task[]> {
    return await this.db.select().from(tasks).orderBy(tasks.order);
  }

  async getTask(id: string): Promise<Task | undefined> {
    const result = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return result[0];
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const allTasks = await this.db.select().from(tasks);
    const maxOrder = allTasks.length > 0 ? Math.max(...allTasks.map(t => t.order ?? 0)) : -1;
    const result = await this.db.insert(tasks).values({ ...insertTask, order: maxOrder + 1 }).returning();
    return result[0];
  }

  async updateTask(id: string, data: Partial<InsertTask>): Promise<Task> {
    const result = await this.db
      .update(tasks)
      .set(data)
      .where(eq(tasks.id, id))
      .returning();
    return result[0];
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  async reorderTasks(taskIds: string[]): Promise<Task[]> {
    for (let i = 0; i < taskIds.length; i++) {
      await this.db.update(tasks).set({ order: i }).where(eq(tasks.id, taskIds[i]));
    }
    return await this.getTasks();
  }

  async getAssignments(): Promise<Assignment[]> {
    return await this.db.select().from(assignments);
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    const result = await this.db.select().from(assignments).where(eq(assignments.id, id));
    return result[0];
  }

  async getConflictingAssignments(personId: string, day: string, weekStartDate: string): Promise<Assignment[]> {
    const result = await this.db
      .select()
      .from(assignments)
      .where(
        eq(assignments.personId, personId)
      );
    
    return result.filter(
      a => a.day === day &&
           a.weekStartDate === weekStartDate
    );
  }

  async createAssignment(insertAssignment: InsertAssignment): Promise<Assignment> {
    const result = await this.db.insert(assignments).values({
      ...insertAssignment,
      batchNumber: insertAssignment.batchNumber || null,
      notes: insertAssignment.notes || null,
      date: insertAssignment.date || null,
    }).returning();
    return result[0];
  }

  async updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment> {
    const existing = await this.getAssignment(id);
    if (!existing) throw new Error("Assignment not found");

    const next: Partial<Assignment> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (key === "weekStartDate") {
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) continue;
        next.weekStartDate = trimmed;
        continue;
      }
      next[key as keyof Assignment] = value as Assignment[keyof Assignment];
    }

    const result = await this.db
      .update(assignments)
      .set(next)
      .where(eq(assignments.id, id))
      .returning();
    return result[0];
  }

  async deleteAssignment(id: string): Promise<void> {
    await this.db.delete(assignments).where(eq(assignments.id, id));
  }
}

export const storage = new PostgresStorage();
