import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import {
  insertPersonSchema,
  insertTaskSchema,
  insertAssignmentSchema,
  insertPremadeFilterSchema,
  insertWorkspaceSchema,
  isoDateString,
} from "@shared/schema";
import { z } from "zod";
import {
  setupAuth,
  isAuthenticated,
  sessionMiddleware,
  passportInitializeMiddleware,
  passportSessionMiddleware,
} from "./replitAuth";

// Super-admin email list — these users can manage workspaces
export const SUPER_ADMIN_EMAILS = new Set<string>([
  "jw24@sanger.ac.uk",
  "admin@sanger.ac.uk",
]);

function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.toLowerCase());
}

function getOriginClientId(req: Request): string | undefined {
  const headerClientId = req.header("x-client-id");
  if (headerClientId) return headerClientId;

  const body = req.body as { originClientId?: unknown } | undefined;
  if (body?.originClientId && typeof body.originClientId === "string") {
    return body.originClientId;
  }

  return undefined;
}

// Extend Request type to carry workspaceId
declare module "express-serve-static-core" {
  interface Request {
    workspaceId?: string;
  }
}

// Session type augmentation
declare module "express-session" {
  interface SessionData {
    activeWorkspaceId?: string;
  }
}

// Middleware: require an active workspace in session
const requireWorkspace = async (req: Request, res: Response, next: NextFunction) => {
  const workspaceId = (req.session as any).activeWorkspaceId;
  if (!workspaceId) {
    return res.status(400).json({ error: "No active workspace selected" });
  }
  req.workspaceId = workspaceId;
  next();
};

// Middleware: require super-admin privileges
const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const userEmail = (req as any).user?.claims?.email;
  if (!isSuperAdmin(userEmail)) {
    console.warn(`[SuperAdmin Check] Access denied for ${userEmail}`);
    return res.status(403).json({ error: "Forbidden: Super-admin access required" });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  const httpServer = createServer(app);
  // Fix 2: increase heartbeat interval from the 25 s default to 60 s.
  // Every open browser tab triggers a ping/pong cycle at the default rate —
  // 60 s means 2.4× fewer server wake-ups for idle connections.
  // pingTimeout raised to 30 s so a slow round-trip doesn't falsely evict connections.
  const io = new SocketServer(httpServer, {
    path: "/socket.io",
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingInterval: 60_000,
    pingTimeout:  30_000,
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request as Request, {} as Response, (sessionError: unknown) => {
      if (sessionError) {
        return next(new Error("Authentication failed"));
      }

      passportInitializeMiddleware(socket.request as Request, {} as Response, (initError: unknown) => {
        if (initError) {
          return next(new Error("Authentication failed"));
        }

        passportSessionMiddleware(socket.request as Request, {} as Response, async (authError: unknown) => {
          if (authError) {
            return next(new Error("Authentication failed"));
          }

          try {
            const req = socket.request as Request & { user?: any };
            const user = req.user;
            if (!user?.claims?.sub || !user?.claims?.email) {
              return next(new Error("Authentication required"));
            }

            const workspaceId =
              typeof socket.handshake.query.workspaceId === "string"
                ? socket.handshake.query.workspaceId
                : undefined;

            if (!workspaceId) {
              return next(new Error("workspaceId required"));
            }

            const userId = user.claims.sub as string;
            const userEmail = user.claims.email as string;

            if (!isSuperAdmin(userEmail)) {
              const membership = await storage.getUserWorkspaceMembership(userId, workspaceId);
              if (!membership) {
                return next(new Error("Unauthorized workspace access"));
              }
            }

            socket.data.workspaceId = workspaceId;
            socket.data.userId = userId;
            next();
          } catch (error) {
            next(new Error("Authentication failed"));
          }
        });
      });
    });
  });

  io.on("connection", (socket) => {
    const workspaceId = socket.data.workspaceId as string | undefined;
    if (!workspaceId) {
      socket.disconnect(true);
      return;
    }
    socket.join(workspaceId);
  });

  // Fix Issue 1: payload carries the actual changed record so clients update
  // their cache directly without making an extra HTTP round-trip
  const broadcastUpdate = (
    type: string,
    workspaceId?: string,
    payload?: Record<string, unknown>,
    originClientId?: string,
  ) => {
    const event = { type, originClientId, ...payload };
    if (workspaceId) {
      io.to(workspaceId).emit("update", event);
    } else {
      io.emit("update", event);
    }
  };

  // ── Auth ────────────────────────────────────────────────────────────────────

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
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

  app.get("/api/admin/users", isAuthenticated, async (_req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // ── My Workspace (session-based) ────────────────────────────────────────────

  // Get workspaces the current user belongs to (Super admins see all)
  app.get("/api/my-workspaces", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      if (isSuperAdmin(userEmail)) {
        const allWorkspaces = await storage.getWorkspaces();
        return res.json(allWorkspaces);
      }
      const userId = req.user.claims.sub;
      const userWorkspaces = await storage.getUserWorkspaces(userId);
      res.json(userWorkspaces);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workspaces" });
    }
  });

  // Get the currently active workspace
  // Fix Issue 6: trust the session — membership was already validated on POST.
  // Removes one DB round-trip per request without compromising security.
  app.get("/api/my-workspace", isAuthenticated, async (req: any, res) => {
    try {
      const workspaceId = (req.session as any).activeWorkspaceId;
      if (!workspaceId) return res.json(null);
      const workspace = await storage.getWorkspace(workspaceId);
      res.json(workspace || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active workspace" });
    }
  });

  // Set the active workspace
  app.post("/api/my-workspace", isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId } = req.body;
      if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

      const userEmail = req.user.claims.email;
      if (!isSuperAdmin(userEmail)) {
        const userId = req.user.claims.sub;
        const membership = await storage.getUserWorkspaceMembership(userId, workspaceId);
        if (!membership) return res.status(403).json({ error: "Not a member of this workspace" });
      }

      (req.session as any).activeWorkspaceId = workspaceId;
      const workspace = await storage.getWorkspace(workspaceId);
      res.json(workspace);
    } catch (error) {
      res.status(500).json({ error: "Failed to set active workspace" });
    }
  });

  // ── Workspace Management (super-admin only) ─────────────────────────────────

  app.get("/api/workspaces", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const all = await storage.getWorkspaces();
      res.json(all);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workspaces" });
    }
  });

  app.post("/api/workspaces", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const data = insertWorkspaceSchema.parse(req.body);
      const workspace = await storage.createWorkspace(data);
      res.json(workspace);
    } catch (error) {
      res.status(400).json({ error: "Invalid workspace data" });
    }
  });

  app.put("/api/workspaces/:id", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const data = insertWorkspaceSchema.partial().parse(req.body);
      const workspace = await storage.updateWorkspace(req.params.id, data);
      res.json(workspace);
    } catch (error) {
      res.status(400).json({ error: "Failed to update workspace" });
    }
  });

  app.delete("/api/workspaces/:id", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      await storage.deleteWorkspace(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete workspace" });
    }
  });

  app.get("/api/workspaces/:id/members", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const members = await storage.getWorkspaceMembers(req.params.id);
      res.json(members);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workspace members" });
    }
  });

  app.post("/api/workspaces/:id/members", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const { userId, role } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const membership = await storage.addUserToWorkspace(userId, req.params.id, role || "member");
      res.json(membership);
    } catch (error) {
      res.status(400).json({ error: "Failed to add member" });
    }
  });

  app.delete("/api/workspaces/:id/members/:userId", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      await storage.removeUserFromWorkspace(req.params.userId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // ── People (workspace-scoped) ───────────────────────────────────────────────

  app.get("/api/people", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const people = await storage.getPeople(req.workspaceId!);
      res.json(people);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch people" });
    }
  });

  app.post("/api/people", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertPersonSchema.parse({ ...req.body, workspaceId: req.workspaceId });
      const person = await storage.createPerson(data);
      broadcastUpdate("people", req.workspaceId, { action: "create", record: person }, getOriginClientId(req));
      res.json(person);
    } catch (error) {
      res.status(400).json({ error: "Invalid person data" });
    }
  });

  app.put("/api/people/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertPersonSchema.partial().parse(req.body);
      const person = await storage.updatePerson(req.params.id, data);
      broadcastUpdate("people", req.workspaceId, { action: "update", record: person }, getOriginClientId(req));
      res.json(person);
    } catch (error) {
      res.status(400).json({ error: "Invalid person data" });
    }
  });

  app.delete("/api/people/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      await storage.deletePerson(req.params.id);
      broadcastUpdate("people", req.workspaceId, { action: "delete", record: { id: req.params.id } }, getOriginClientId(req));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete person" });
    }
  });

  app.post("/api/people/reorder-list", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { personIds } = req.body;
      if (!Array.isArray(personIds)) return res.status(400).json({ error: "personIds must be an array" });
      const result = await storage.reorderPeople(personIds);
      broadcastUpdate("people", req.workspaceId, undefined, getOriginClientId(req));
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: "Failed to reorder people" });
    }
  });

  app.patch("/api/people/:id/toggle-excluded", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const person = await storage.togglePersonExcluded(req.params.id);
      broadcastUpdate("people", req.workspaceId, { action: "update", record: person }, getOriginClientId(req));
      res.json(person);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle excluded status" });
    }
  });

  const linkUserSchema = z.object({ userId: z.string().nullable() });

  app.patch("/api/people/:id/link-user", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const personId = req.params.id;
      const { userId } = linkUserSchema.parse(req.body);

      if (userId) {
        const user = await storage.getUser(userId);
        if (!user) return res.status(400).json({ error: "User not found" });
        const allPeople = await storage.getPeople(req.workspaceId!);
        const alreadyLinked = allPeople.find(p => p.userId === userId && p.id !== personId);
        if (alreadyLinked) return res.status(400).json({ error: `User is already linked to ${alreadyLinked.name}` });
      }

      const person = await storage.updatePerson(personId, { userId });
      broadcastUpdate("people", req.workspaceId, { action: "update", record: person }, getOriginClientId(req));
      res.json(person);
    } catch (error) {
      console.error("Link user error:", error);
      res.status(400).json({ error: "Failed to link user" });
    }
  });

  // ── Tasks (workspace-scoped) ────────────────────────────────────────────────

  app.get("/api/tasks", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const tasks = await storage.getTasks(req.workspaceId!);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertTaskSchema.parse({ ...req.body, workspaceId: req.workspaceId });
      const task = await storage.createTask(data);
      broadcastUpdate("tasks", req.workspaceId, { action: "create", record: task }, getOriginClientId(req));
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.put("/api/tasks/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertTaskSchema.partial().parse(req.body);
      const task = await storage.updateTask(req.params.id, data);
      broadcastUpdate("tasks", req.workspaceId, { action: "update", record: task }, getOriginClientId(req));
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      await storage.deleteTask(req.params.id);
      broadcastUpdate("tasks", req.workspaceId, { action: "delete", record: { id: req.params.id } }, getOriginClientId(req));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  app.post("/api/tasks/reorder-list", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { taskIds } = req.body;
      if (!Array.isArray(taskIds)) return res.status(400).json({ error: "taskIds must be an array" });
      const result = await storage.reorderTasks(taskIds);
      broadcastUpdate("tasks", req.workspaceId, undefined, getOriginClientId(req));
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: "Failed to reorder tasks" });
    }
  });

  // ── Assignments (workspace-scoped) ──────────────────────────────────────────

  app.get("/api/assignments", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { weekStartDate, startDate, endDate } = req.query;

      if (startDate && endDate && typeof startDate === "string" && typeof endDate === "string") {
        return res.json(await storage.getAssignmentsByDateRange(startDate, endDate, req.workspaceId!));
      }
      if (weekStartDate && typeof weekStartDate === "string") {
        return res.json(await storage.getAssignmentsByWeek(weekStartDate, req.workspaceId!));
      }
      res.json(await storage.getAssignments(req.workspaceId!));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });


  app.get("/api/assignments/next-batch-id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const taskId = typeof req.query.taskId === "string" ? req.query.taskId : "";
      if (!taskId) return res.status(400).json({ error: "taskId is required" });

      const task = await storage.getTask(taskId);
      if (!task || task.workspaceId !== req.workspaceId) {
        return res.status(404).json({ error: "Task not found" });
      }

      const words = task.name.trim().split(/\s+/);
      const prefix = words.length >= 2
        ? (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase()
        : words[0]?.substring(0, 4).toUpperCase() ?? "";

      if (!prefix) return res.status(400).json({ error: "Unable to derive batch prefix for task" });

      const batchId = await storage.getNextBatchId(req.workspaceId!, prefix);
      res.json({ batchId });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate next batch ID" });
    }
  });

  app.post("/api/assignments", isAuthenticated, requireWorkspace, async (req: any, res) => {
    try {
      const { override, ...bodyData } = req.body;
      const data = insertAssignmentSchema.parse({ ...bodyData, workspaceId: req.workspaceId });
      const userId = req.user.claims.sub;
      const assignment = await storage.createAssignment(data, userId);
      // Fix Issue 1: send the actual record so clients can update cache without refetching
      broadcastUpdate("assignments", req.workspaceId, { action: "create", record: assignment }, getOriginClientId(req));
      res.json(assignment);
    } catch (error) {
      console.error("Assignment validation error:", error);
      res.status(400).json({ error: "Invalid assignment data" });
    }
  });

  const assignmentPatchSchema = z.object({
    taskId: insertAssignmentSchema.shape.taskId.optional(),
    batchNumber: insertAssignmentSchema.shape.batchNumber.optional(),
    batchSize: insertAssignmentSchema.shape.batchSize.optional(),
    notes: insertAssignmentSchema.shape.notes.optional().nullable(),
    date: insertAssignmentSchema.shape.date.optional().nullable(),
    personId: insertAssignmentSchema.shape.personId.optional(),
    customName: insertAssignmentSchema.shape.customName.optional().nullable(),
    day: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]).optional(),
    weekStartDate: isoDateString.optional(),
  }).strict();

  app.patch("/api/assignments/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const existing = await storage.getAssignment(req.params.id);
      if (!existing) return res.status(404).json({ error: "Assignment not found" });

      const parsed = assignmentPatchSchema.partial().parse(req.body ?? {});
      const { weekStartDate, ...mutable } = parsed;
      const updated = await storage.updateAssignment(req.params.id, {
        ...mutable,
        weekStartDate: weekStartDate ?? existing.weekStartDate,
      });
      // Fix Issue 1: send the actual record so clients can update cache without refetching
      broadcastUpdate("assignments", req.workspaceId, { action: "update", record: updated }, getOriginClientId(req));
      res.json(updated);
    } catch (error) {
      console.error("PATCH assignment error:", error);
      res.status(400).json({ error: "Invalid update data" });
    }
  });

  app.post("/api/assignments/reorder-cell", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { personId, day, weekStartDate, assignmentIds } = req.body;
      if (!personId || !day || !weekStartDate || !Array.isArray(assignmentIds)) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const result = await storage.reorderAssignmentsByCell(personId, day, weekStartDate, assignmentIds);
      broadcastUpdate("assignments", req.workspaceId, {
        action: "reorder",
        weekStartDate,
        personId,
        day,
        orderedAssignmentIds: assignmentIds,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: "Failed to reorder assignments" });
    }
  });

  app.delete("/api/assignments/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      // Fetch before deleting so we can tell clients which record was removed
      const existing = await storage.getAssignment(req.params.id);
      await storage.deleteAssignment(req.params.id);
      // Fix Issue 1: send id + weekStartDate so clients can remove from cache without refetching
      broadcastUpdate("assignments", req.workspaceId, {
        action: "delete",
        record: { id: req.params.id, weekStartDate: existing?.weekStartDate },
      }, getOriginClientId(req));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });

  // ── Premade Filters (workspace-scoped) ──────────────────────────────────────

  app.get("/api/premade-filters", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const filters = await storage.getPremadeFilters(req.workspaceId!);
      res.json(filters);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch premade filters" });
    }
  });

  app.post("/api/premade-filters", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertPremadeFilterSchema.parse({ ...req.body, workspaceId: req.workspaceId });
      const filter = await storage.createPremadeFilter(data);
      broadcastUpdate("premade-filters", req.workspaceId, { action: "create", record: filter }, getOriginClientId(req));
      res.json(filter);
    } catch (error) {
      res.status(400).json({ error: "Invalid filter data" });
    }
  });

  app.put("/api/premade-filters/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const filter = await storage.updatePremadeFilter(req.params.id, req.body);
      broadcastUpdate("premade-filters", req.workspaceId, { action: "update", record: filter }, getOriginClientId(req));
      res.json(filter);
    } catch (error) {
      res.status(400).json({ error: "Failed to update premade filter" });
    }
  });

  app.delete("/api/premade-filters/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      await storage.deletePremadeFilter(req.params.id);
      broadcastUpdate("premade-filters", req.workspaceId, { action: "delete", record: { id: req.params.id } }, getOriginClientId(req));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete premade filter" });
    }
  });

  return httpServer;
}
