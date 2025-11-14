import {
  type Person,
  type InsertPerson,
  type Task,
  type InsertTask,
  type Assignment,
  type InsertAssignment
} from "@shared/schema";
import { randomUUID } from "crypto";

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

    samplePeople.forEach((p) => {
      const id = randomUUID();
      this.people.set(id, { id, ...p });
    });

    sampleTasks.forEach((t) => {
      const id = randomUUID();
      this.tasks.set(id, { id, ...t });
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
    if (!existing) {
      throw new Error("Assignment not found");
    }
    const updated = { ...existing, ...data };
    this.assignments.set(id, updated);
    return updated;
  }

  async deleteAssignment(id: string): Promise<void> {
    this.assignments.delete(id);
  }
}

export const storage = new MemStorage();
