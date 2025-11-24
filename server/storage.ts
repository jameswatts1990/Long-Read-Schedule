import {
  type Person,
  type InsertPerson,
  type Task,
  type InsertTask,
  type Assignment,
  type InsertAssignment,
  people,
  tasks,
  assignments,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";

export interface IStorage {
  getPeople(): Promise<Person[]>;
  getPerson(id: string): Promise<Person | undefined>;
  createPerson(person: InsertPerson): Promise<Person>;
  deletePerson(id: string): Promise<void>;

  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  getAssignments(): Promise<Assignment[]>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  getConflictingAssignments(personId: string, day: string, period: string, weekStartDate: string): Promise<Assignment[]>;
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment>;
  deleteAssignment(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private people: Map<string, Person>;
  private tasks: Map<string, Task>;
  private assignments: Map<string, Assignment>;

  constructor() {
    this.people = new Map();
    this.tasks = new Map();
    this.assignments = new Map();
    
    this.initializeSampleData();
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
    samplePeople.forEach((p) => {
      const id = randomUUID();
      this.people.set(id, { id, ...p });
      peopleIds.push(id);
    });

    const taskIds: string[] = [];
    sampleTasks.forEach((t) => {
      const id = randomUUID();
      this.tasks.set(id, { id, ...t });
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
        period: "AM",
        weekStartDate: currentWeekStart,
        batchNumber: "B-2024-001",
        notes: null,
        date: null,
      },
      {
        taskId: taskIds[1],
        personId: peopleIds[0],
        day: "Monday",
        period: "PM",
        weekStartDate: currentWeekStart,
        batchNumber: null,
        notes: null,
        date: null,
      },
      {
        taskId: taskIds[0],
        personId: peopleIds[1],
        day: "Tuesday",
        period: "AM",
        weekStartDate: currentWeekStart,
        batchNumber: "B-2024-002",
        notes: "Priority sample",
        date: null,
      },
      {
        taskId: taskIds[2],
        personId: peopleIds[2],
        day: "Wednesday",
        period: "PM",
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
    return Array.from(this.people.values());
  }

  async getPerson(id: string): Promise<Person | undefined> {
    return this.people.get(id);
  }

  async createPerson(insertPerson: InsertPerson): Promise<Person> {
    const id = randomUUID();
    const person: Person = { ...insertPerson, id };
    this.people.set(id, person);
    return person;
  }

  async deletePerson(id: string): Promise<void> {
    this.people.delete(id);
  }

  async getTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const task: Task = { ...insertTask, id };
    this.tasks.set(id, task);
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async getAssignments(): Promise<Assignment[]> {
    return Array.from(this.assignments.values());
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    return this.assignments.get(id);
  }

  async getConflictingAssignments(personId: string, day: string, period: string, weekStartDate: string): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      a => a.personId === personId &&
           a.day === day &&
           a.period === period &&
           a.weekStartDate === weekStartDate
    );
  }

  async createAssignment(insertAssignment: InsertAssignment): Promise<Assignment> {
    const id = randomUUID();
    const assignment: Assignment = {
      id,
      ...insertAssignment,
      batchNumber: insertAssignment.batchNumber || null,
      notes: insertAssignment.notes || null,
      date: insertAssignment.date || null,
    };
    this.assignments.set(id, assignment);
    return assignment;
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

  async getPeople(): Promise<Person[]> {
    return await this.db.select().from(people);
  }

  async getPerson(id: string): Promise<Person | undefined> {
    const result = await this.db.select().from(people).where(eq(people.id, id));
    return result[0];
  }

  async createPerson(insertPerson: InsertPerson): Promise<Person> {
    const result = await this.db.insert(people).values(insertPerson).returning();
    return result[0];
  }

  async deletePerson(id: string): Promise<void> {
    await this.db.delete(people).where(eq(people.id, id));
  }

  async getTasks(): Promise<Task[]> {
    return await this.db.select().from(tasks);
  }

  async getTask(id: string): Promise<Task | undefined> {
    const result = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return result[0];
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const result = await this.db.insert(tasks).values(insertTask).returning();
    return result[0];
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  async getAssignments(): Promise<Assignment[]> {
    return await this.db.select().from(assignments);
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    const result = await this.db.select().from(assignments).where(eq(assignments.id, id));
    return result[0];
  }

  async getConflictingAssignments(personId: string, day: string, period: string, weekStartDate: string): Promise<Assignment[]> {
    const result = await this.db
      .select()
      .from(assignments)
      .where(
        eq(assignments.personId, personId)
      );
    
    return result.filter(
      a => a.day === day &&
           a.period === period &&
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
