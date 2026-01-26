import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPersonSchema, insertTaskSchema, insertAssignmentSchema, insertPremadeFilterSchema, isoDateString } from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);

  // Auth endpoint - get current user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // All API routes below require authentication
  app.get("/api/people", isAuthenticated, async (_req, res) => {
    try {
      const people = await storage.getPeople();
      res.json(people);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch people" });
    }
  });

  app.post("/api/people", isAuthenticated, async (req, res) => {
    try {
      const data = insertPersonSchema.parse(req.body);
      const person = await storage.createPerson(data);
      res.json(person);
    } catch (error) {
      res.status(400).json({ error: "Invalid person data" });
    }
  });

  app.delete("/api/people/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePerson(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete person" });
    }
  });

  app.post("/api/people/reorder-list", isAuthenticated, async (req, res) => {
    try {
      const { personIds } = req.body;
      if (!Array.isArray(personIds)) {
        return res.status(400).json({ error: "personIds must be an array" });
      }
      const result = await storage.reorderPeople(personIds);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: "Failed to reorder people" });
    }
  });

  app.patch("/api/people/:id/toggle-excluded", isAuthenticated, async (req, res) => {
    try {
      const person = await storage.togglePersonExcluded(req.params.id);
      res.json(person);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle excluded status" });
    }
  });

  app.get("/api/tasks", isAuthenticated, async (_req, res) => {
    try {
      const tasks = await storage.getTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", isAuthenticated, async (req, res) => {
    try {
      const data = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(data);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.put("/api/people/:id", isAuthenticated, async (req, res) => {
    try {
      const data = insertPersonSchema.partial().parse(req.body);
      const person = await storage.updatePerson(req.params.id, data);
      res.json(person);
    } catch (error) {
      res.status(400).json({ error: "Invalid person data" });
    }
  });

  app.put("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const data = insertTaskSchema.partial().parse(req.body);
      const task = await storage.updateTask(req.params.id, data);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteTask(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  app.post("/api/tasks/reorder-list", isAuthenticated, async (req, res) => {
    try {
      const { taskIds } = req.body;
      if (!Array.isArray(taskIds)) {
        return res.status(400).json({ error: "taskIds must be an array" });
      }
      const result = await storage.reorderTasks(taskIds);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: "Failed to reorder tasks" });
    }
  });

  app.get("/api/assignments", isAuthenticated, async (req, res) => {
    try {
      const { weekStartDate, startDate, endDate } = req.query;
      
      // Date range query for month view
      if (startDate && endDate && typeof startDate === 'string' && typeof endDate === 'string') {
        const filtered = await storage.getAssignmentsByDateRange(startDate, endDate);
        return res.json(filtered);
      }
      
      // Single week query
      if (weekStartDate && typeof weekStartDate === 'string') {
        const filtered = await storage.getAssignmentsByWeek(weekStartDate);
        return res.json(filtered);
      }
      
      const assignments = await storage.getAssignments();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  app.post("/api/assignments", isAuthenticated, async (req: any, res) => {
    try {
      const { override, ...bodyData } = req.body;
      const data = insertAssignmentSchema.parse(bodyData);
      const userId = req.user.claims.sub;
      
      // Multiple tasks allowed per time slot - just create the assignment
      const assignment = await storage.createAssignment(data, userId);
      res.json(assignment);
    } catch (error) {
      console.error("Assignment validation error:", error);
      console.error("Request body:", req.body);
      res.status(400).json({ error: "Invalid assignment data" });
    }
  });

  const assignmentPatchSchema = z.object({
    taskId: insertAssignmentSchema.shape.taskId.optional(),
    batchNumber: insertAssignmentSchema.shape.batchNumber.optional(),
    batchSize: insertAssignmentSchema.shape.batchSize.optional(),
    notes: insertAssignmentSchema.shape.notes.optional(),
    date: insertAssignmentSchema.shape.date.optional(),
    personId: insertAssignmentSchema.shape.personId.optional(),
    day: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]).optional(),
    weekStartDate: isoDateString.optional(),
  }).strict();

  app.patch("/api/assignments/:id", isAuthenticated, async (req, res) => {
    try {
      const assignmentId = req.params.id;
      const existing = await storage.getAssignment(assignmentId);
      if (!existing) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const parsed = assignmentPatchSchema.parse(req.body ?? {});
      const { weekStartDate, ...mutable } = parsed;
      const nextPayload = {
        ...mutable,
        weekStartDate: weekStartDate ?? existing.weekStartDate,
      };

      const updated = await storage.updateAssignment(assignmentId, nextPayload);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: "Invalid update data" });
    }
  });

  app.post("/api/assignments/reorder-cell", isAuthenticated, async (req, res) => {
    try {
      const { personId, day, weekStartDate, assignmentIds } = req.body;
      if (!personId || !day || !weekStartDate || !Array.isArray(assignmentIds)) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const result = await storage.reorderAssignmentsByCell(personId, day, weekStartDate, assignmentIds);
      res.json(result);
    } catch (error) {
      console.error("Reorder error:", error);
      res.status(400).json({ error: "Failed to reorder assignments", details: String(error) });
    }
  });

  app.delete("/api/assignments/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteAssignment(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });

  // Premade Filters routes
  app.get("/api/premade-filters", isAuthenticated, async (_req, res) => {
    try {
      const filters = await storage.getPremadeFilters();
      res.json(filters);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch premade filters" });
    }
  });

  app.post("/api/premade-filters", isAuthenticated, async (req, res) => {
    try {
      const data = insertPremadeFilterSchema.parse(req.body);
      const filter = await storage.createPremadeFilter(data);
      res.json(filter);
    } catch (error) {
      res.status(400).json({ error: "Invalid filter data" });
    }
  });

  app.put("/api/premade-filters/:id", isAuthenticated, async (req, res) => {
    try {
      const filter = await storage.updatePremadeFilter(req.params.id, req.body);
      res.json(filter);
    } catch (error) {
      res.status(400).json({ error: "Failed to update premade filter" });
    }
  });

  app.delete("/api/premade-filters/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePremadeFilter(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete premade filter" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
