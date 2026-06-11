import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import {
  insertPersonSchema,
  insertTaskSchema,
  insertAssignmentSchema,
  insertPremadeFilterSchema,
  insertRotaTaskSchema,
  insertWorkspaceSchema,
  isoDateString,
} from "@shared/schema";
import { z, ZodError } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { getDiagnosticsSnapshot } from "./diagnostics";
import { sendSlackDM, isSlackEnabled, verifySlackSignature, getMondayUTC, getOffsetMondayUTC, getTodayInfo, formatWeekScheduleMessage, formatDayScheduleMessage, buildAppHomeBlocks, publishAppHome, buildSchedulerLink, buildChangeSummary } from "./slack.js";

// Super-admin email list — loaded from SUPER_ADMIN_EMAILS env var (comma-separated)
// so access can be changed without a code deployment.
const _superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);
export const SUPER_ADMIN_EMAILS = new Set<string>(_superAdminEmails);

function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.toLowerCase());
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

// Middleware: require an active workspace in session.
// Auto-recovers from DB when the session is missing the workspace — this can happen due to
// a race condition on page load where a concurrent token-refresh session.save() runs after
// the workspace auto-select but overwrites it (each request loads the session independently).
const requireWorkspace = async (req: Request, res: Response, next: NextFunction) => {
  let workspaceId = (req.session as any).activeWorkspaceId;

  if (!workspaceId) {
    const userId = (req as any).user?.claims?.sub;
    const userEmail = (req as any).user?.claims?.email;
    if (userId) {
      try {
        const userWorkspaces = isSuperAdmin(userEmail)
          ? await storage.getWorkspaces()
          : await storage.getUserWorkspaces(userId);
        if (userWorkspaces.length > 0) {
          workspaceId = userWorkspaces[0].id;
          (req.session as any).activeWorkspaceId = workspaceId;
        }
      } catch {
        // DB lookup failed — fall through to 400
      }
    }
  }

  if (!workspaceId) {
    return res.status(400).json({ message: "No active workspace selected" });
  }
  req.workspaceId = workspaceId;
  next();
};

// Middleware: require admin or super-admin privileges
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const userEmail = (req as any).user?.claims?.email;
  if (isSuperAdmin(userEmail)) return next();
  const userId = (req as any).user?.claims?.sub;
  if (userId) {
    const dbUser = await storage.getUser(userId);
    if (dbUser?.role === "admin" || dbUser?.role === "super_admin") return next();
  }
  return res.status(403).json({ message: "Forbidden: Admin access required" });
};

// Middleware: require super-admin privileges (env var list OR db role)
const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const userEmail = (req as any).user?.claims?.email;
  if (isSuperAdmin(userEmail)) return next();
  const userId = (req as any).user?.claims?.sub;
  if (userId) {
    const dbUser = await storage.getUser(userId);
    if (dbUser?.role === "super_admin") return next();
  }
  console.warn(`[SuperAdmin Check] Access denied for ${userEmail}`);
  return res.status(403).json({ message: "Forbidden: Super-admin access required" });
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
    cors: {
      origin: (process.env.ALLOWED_ORIGIN ?? "").split(",").map((o: string) => o.trim()).filter(Boolean),
      methods: ["GET", "POST"],
    },
    pingInterval: 60_000,
    pingTimeout:  30_000,
  });

  io.on("connection", (socket) => {
    const workspaceId = socket.handshake.query.workspaceId as string | undefined;
    if (workspaceId) {
      socket.join(workspaceId);
    }
  });

  // Fix Issue 1: payload carries the actual changed record so clients update
  // their cache directly without making an extra HTTP round-trip
  const broadcastUpdate = (type: string, workspaceId?: string, payload?: Record<string, unknown>) => {
    const event = { type, ...payload };
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
      res.json({
        ...user,
        isSuperAdmin: isSuperAdmin(req.user.claims.email) || user?.role === "super_admin",
        slackEnabled: !!process.env.SLACK_BOT_TOKEN,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/user/notification-settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getNotificationSettings(userId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching notification settings:", error);
      res.status(500).json({ message: "Failed to fetch notification settings" });
    }
  });

  app.patch("/api/user/notification-settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { dailyReminder, weeklyPreview } = req.body;
      await storage.upsertNotificationSettings(userId, {
        dailyReminder: dailyReminder ? 1 : 0,
        weeklyPreview: weeklyPreview ? 1 : 0,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving notification settings:", error);
      res.status(500).json({ message: "Failed to save notification settings" });
    }
  });

  app.get("/api/auth/onboarding-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const linkedPeople = await storage.getPeopleByUser(userId);
      const userWorkspaces = await storage.getUserWorkspaces(userId);

      res.json({
        needsOnboarding: linkedPeople.length === 0 && userWorkspaces.length > 0,
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  const completeOnboardingSchema = z.object({
    workspaceId: z.string().trim().min(1, "workspaceId required"),
    firstName: z.string().trim().min(1, "firstName required"),
    lastName: z.string().trim().min(1, "lastName required"),
  });

  app.post("/api/auth/complete-onboarding", isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId, firstName, lastName } = completeOnboardingSchema.parse(req.body);
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;

      if (!isSuperAdmin(userEmail)) {
        const membership = await storage.getUserWorkspaceMembership(userId, workspaceId);
        if (!membership) return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const normalizedFirstName = firstName.trim();
      const normalizedLastName = lastName.trim();
      const fullName = `${normalizedFirstName} ${normalizedLastName}`.replace(/\s+/g, " ").trim();

      const existingUser = await storage.getUser(userId);
      await storage.upsertUser({
        id: userId,
        email: existingUser?.email ?? userEmail ?? null,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        profileImageUrl: existingUser?.profileImageUrl ?? null,
      });

      let person = await storage.findUnlinkedPersonByName(workspaceId, fullName);
      let linkedExisting = true;

      if (person) {
        person = await storage.updatePerson(person.id, { userId });
      } else {
        person = await storage.createPerson({
          name: fullName,
          color: "#3B82F6",
          userId,
          workspaceId,
        });
        linkedExisting = false;
      }

      (req.session as any).activeWorkspaceId = workspaceId;
      const workspace = await storage.getWorkspace(workspaceId);

      broadcastUpdate("people", workspaceId);

      res.json({ workspace, person, linkedExisting });
    } catch (error) {
      res.status(400).json({ message: "Failed to complete onboarding" });
    }
  });

  app.get("/api/users/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      // Only allow lookup of users who share the active workspace
      const membership = await storage.getUserWorkspaceMembership(req.params.id, req.workspaceId!);
      if (!membership) return res.status(403).json({ message: "Forbidden" });
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, async (_req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  const userRoleSchema = z.object({
    role: z.enum(["member", "admin", "super_admin"]),
  });

  app.patch("/api/admin/users/:userId/role", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { role } = userRoleSchema.parse(req.body);
      const updated = await storage.updateUserRole(req.params.userId, role);
      res.json(updated);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "Invalid role" });
      }
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  app.get("/api/admin/diagnostics/memory", isAuthenticated, requireSuperAdmin, async (_req, res) => {
    try {
      res.json(getDiagnosticsSnapshot(true));
    } catch (error) {
      res.status(500).json({ message: "Failed to collect diagnostics" });
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
      res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  });

  // Get the currently active workspace — auto-selects the first membership if session has none
  app.get("/api/my-workspace", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let workspaceId = (req.session as any).activeWorkspaceId;

      if (!workspaceId) {
        const userEmail = req.user.claims.email;
        const userWorkspaces = isSuperAdmin(userEmail)
          ? await storage.getWorkspaces()
          : await storage.getUserWorkspaces(userId);
        if (userWorkspaces.length > 0) {
          workspaceId = userWorkspaces[0].id;
          (req.session as any).activeWorkspaceId = workspaceId;
          // Save synchronously before responding so the workspace is in DB before
          // the client fires subsequent requests (avoids the concurrent-request race).
          await new Promise<void>((resolve, reject) =>
            req.session.save((err) => (err ? reject(err) : resolve()))
          );
        }
      }

      if (!workspaceId) return res.json(null);
      const workspace = await storage.getWorkspace(workspaceId);
      res.json(workspace || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active workspace" });
    }
  });

  // Set the active workspace
  app.post("/api/my-workspace", isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId } = req.body;
      if (!workspaceId) return res.status(400).json({ message: "workspaceId required" });

      const userEmail = req.user.claims.email;
      if (!isSuperAdmin(userEmail)) {
        const userId = req.user.claims.sub;
        const membership = await storage.getUserWorkspaceMembership(userId, workspaceId);
        if (!membership) return res.status(403).json({ message: "Not a member of this workspace" });
      }

      (req.session as any).activeWorkspaceId = workspaceId;
      // Save before responding so the workspace is in DB before the client fires
      // subsequent workspace-scoped requests.
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );
      const workspace = await storage.getWorkspace(workspaceId);
      res.json(workspace);
    } catch (error) {
      res.status(500).json({ message: "Failed to set active workspace" });
    }
  });

  // List all workspaces — any authenticated user (used by new-user self-join screen)
  app.get("/api/workspaces/available", isAuthenticated, async (_req, res) => {
    try {
      const all = await storage.getWorkspaces();
      res.json(all);
    } catch {
      res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  });

  // Self-join a workspace — any authenticated user can join as a member
  app.post("/api/workspaces/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspaceId = req.params.id;

      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      const existing = await storage.getUserWorkspaceMembership(userId, workspaceId);
      if (!existing) {
        await storage.addUserToWorkspace(userId, workspaceId, "member");
      }

      (req.session as any).activeWorkspaceId = workspaceId;
      res.json(workspace);
    } catch {
      res.status(500).json({ message: "Failed to join workspace" });
    }
  });

  // ── Workspace Management (super-admin only) ─────────────────────────────────

  app.get("/api/workspaces", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const all = await storage.getWorkspaces();
      res.json(all);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  });

  app.post("/api/workspaces", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const data = insertWorkspaceSchema.parse(req.body);
      const workspace = await storage.createWorkspace(data);
      res.json(workspace);
    } catch (error) {
      res.status(400).json({ message: "Invalid workspace data" });
    }
  });

  app.put("/api/workspaces/:id", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const data = insertWorkspaceSchema.partial().parse(req.body);
      const workspace = await storage.updateWorkspace(req.params.id, data);
      res.json(workspace);
    } catch (error) {
      res.status(400).json({ message: "Failed to update workspace" });
    }
  });

  app.delete("/api/workspaces/:id", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      await storage.deleteWorkspace(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete workspace" });
    }
  });

  app.get("/api/workspaces/:id/members", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const members = await storage.getWorkspaceMembers(req.params.id);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch workspace members" });
    }
  });

  app.post("/api/workspaces/:id/members", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const { userId, role } = req.body;
      if (!userId) return res.status(400).json({ message: "userId required" });
      const membership = await storage.addUserToWorkspace(userId, req.params.id, role || "member");
      res.json(membership);
    } catch (error) {
      res.status(400).json({ message: "Failed to add member" });
    }
  });

  app.delete("/api/workspaces/:id/members/:userId", isAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      await storage.removeUserFromWorkspace(req.params.userId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // ── People (workspace-scoped) ───────────────────────────────────────────────

  app.get("/api/people", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const people = await storage.getPeople(req.workspaceId!);
      res.json(people);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch people" });
    }
  });

  app.post("/api/people", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertPersonSchema.parse({ ...req.body, workspaceId: req.workspaceId });
      const person = await storage.createPerson(data);
      broadcastUpdate("people", req.workspaceId);
      res.json(person);
    } catch (error) {
      res.status(400).json({ message: "Invalid person data" });
    }
  });

  app.put("/api/people/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const existing = await storage.getPerson(req.params.id);
      if (!existing || existing.workspaceId !== req.workspaceId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertPersonSchema.partial().parse(req.body);
      const person = await storage.updatePerson(req.params.id, data);
      broadcastUpdate("people", req.workspaceId);
      res.json(person);
    } catch (error) {
      res.status(400).json({ message: "Invalid person data" });
    }
  });

  app.delete("/api/people/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const existing = await storage.getPerson(req.params.id);
      if (!existing || existing.workspaceId !== req.workspaceId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deletePerson(req.params.id);
      broadcastUpdate("people", req.workspaceId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete person" });
    }
  });

  app.post("/api/people/reorder-list", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { personIds } = req.body;
      if (!Array.isArray(personIds)) return res.status(400).json({ message: "personIds must be an array" });
      const result = await storage.reorderPeople(personIds);
      broadcastUpdate("people", req.workspaceId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: "Failed to reorder people" });
    }
  });

  app.patch("/api/people/:id/toggle-excluded", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const person = await storage.togglePersonExcluded(req.params.id);
      broadcastUpdate("people", req.workspaceId);
      res.json(person);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle excluded status" });
    }
  });

  const linkUserSchema = z.object({ userId: z.string().nullable() });

  app.patch("/api/people/:id/link-user", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const personId = req.params.id;
      const { userId } = linkUserSchema.parse(req.body);

      if (userId) {
        const user = await storage.getUser(userId);
        if (!user) return res.status(400).json({ message: "User not found" });
        const alreadyLinked = await storage.findPersonByUserId(userId, req.workspaceId!, personId);
        if (alreadyLinked) return res.status(400).json({ message: `User is already linked to ${alreadyLinked.name}` });
      }

      const person = await storage.updatePerson(personId, { userId });
      broadcastUpdate("people", req.workspaceId);
      res.json(person);
    } catch (error) {
      console.error("Link user error:", error);
      res.status(400).json({ message: "Failed to link user" });
    }
  });

  const slackUserIdSchema = z.object({
    slackUserId: z
      .string()
      .trim()
      .nullable()
      .refine(
        (v) => v === null || v === "" || /^[UW][A-Z0-9]{8,}$/.test(v),
        { message: "Must be a valid Slack member ID (e.g. U012AB3CD)" },
      )
      .transform((v) => (v === "" ? null : v)),
  });

  app.patch("/api/people/:id/slack-user-id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { slackUserId } = slackUserIdSchema.parse(req.body);
      const person = await storage.updatePersonSlackUserId(req.params.id, slackUserId);
      broadcastUpdate("people", req.workspaceId);
      res.json(person);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "Invalid data" });
      }
      res.status(500).json({ message: "Failed to update Slack user ID" });
    }
  });

  app.post("/api/people/:id/slack-test", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      if (!isSlackEnabled()) {
        return res.status(400).json({ message: "Slack is not configured on this server" });
      }
      const people = await storage.getPeople(req.workspaceId!);
      const person = people.find((p) => p.id === req.params.id);
      if (!person) return res.status(404).json({ message: "Person not found" });
      const slackUserId = (person as any).slackUserId;
      if (!slackUserId) {
        return res.status(400).json({ message: "No Slack member ID set for this person" });
      }
      const sent = await sendSlackDM(slackUserId, `:white_check_mark: Test message from Lab Scheduler — Slack reminders are working for *${person.name}*.`);
      if (!sent) {
        return res.status(502).json({ message: "Failed to send test DM — check server logs for details" });
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to send test Slack DM" });
    }
  });

  app.post("/api/people/:id/slack-refresh-home", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      if (!isSlackEnabled()) {
        return res.status(400).json({ message: "Slack is not configured on this server" });
      }
      const people = await storage.getPeople(req.workspaceId!);
      const person = people.find((p) => p.id === req.params.id);
      if (!person) return res.status(404).json({ message: "Person not found" });
      const slackUserId = (person as any).slackUserId;
      if (!slackUserId) {
        return res.status(400).json({ message: "No Slack member ID set for this person" });
      }
      const today = getTodayInfo();
      const nextWeekStartDate = getOffsetMondayUTC(1);
      const [rows, nextWeekRows] = await Promise.all([
        storage.getWeekAssignmentsForSlackUserId(slackUserId, today.weekStartDate),
        storage.getWeekAssignmentsForSlackUserId(slackUserId, nextWeekStartDate),
      ]);
      const blocks = buildAppHomeBlocks(rows, today.weekStartDate, true, today, nextWeekRows, nextWeekStartDate);
      await publishAppHome(slackUserId, blocks);
      res.json({ ok: true, message: "App Home published — check the Home tab in Slack" });
    } catch (error) {
      console.error("[slack] Manual App Home refresh failed:", error);
      res.status(500).json({ message: "Failed to publish App Home — check server logs" });
    }
  });

  // ── Tasks (workspace-scoped) ────────────────────────────────────────────────

  app.get("/api/tasks", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const tasks = await storage.getTasks(req.workspaceId!);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertTaskSchema.parse({ ...req.body, workspaceId: req.workspaceId });
      const task = await storage.createTask(data);
      broadcastUpdate("tasks", req.workspaceId);
      res.json(task);
    } catch (error) {
      res.status(400).json({ message: "Invalid task data" });
    }
  });

  app.put("/api/tasks/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const existing = await storage.getTask(req.params.id);
      if (!existing || existing.workspaceId !== req.workspaceId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertTaskSchema.partial().parse(req.body);
      const task = await storage.updateTask(req.params.id, data);
      broadcastUpdate("tasks", req.workspaceId);
      res.json(task);
    } catch (error) {
      res.status(400).json({ message: "Invalid task data" });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const existing = await storage.getTask(req.params.id);
      if (!existing || existing.workspaceId !== req.workspaceId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteTask(req.params.id);
      broadcastUpdate("tasks", req.workspaceId);
      // Also broadcast assignments deletion since task deletion cascades to remove all assignments
      broadcastUpdate("assignments", req.workspaceId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Admin cleanup: delete all assignments for a task on or after a given date
  app.delete("/api/admin/assignments-cleanup", isAuthenticated, requireWorkspace, async (req: any, res) => {
    try {
      const isSuperAdmin = SUPER_ADMIN_EMAILS.has(req.user?.email);
      if (!isSuperAdmin) return res.status(403).json({ message: "Only super admins can use cleanup endpoint" });

      const { taskId, afterDate } = z.object({
        taskId: z.string().min(1),
        afterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).parse(req.body);

      const result = await storage.deleteAssignmentsByTaskAndDate(taskId, req.workspaceId!, afterDate);
      if (result.deletedCount > 0) {
        broadcastUpdate("assignments", req.workspaceId);
      }
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: "Failed to cleanup assignments" });
    }
  });

  app.post("/api/tasks/reorder-list", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { taskIds } = req.body;
      if (!Array.isArray(taskIds)) return res.status(400).json({ message: "taskIds must be an array" });
      const result = await storage.reorderTasks(taskIds);
      broadcastUpdate("tasks", req.workspaceId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: "Failed to reorder tasks" });
    }
  });

  // ── Rota Tasks (workspace-scoped) ──────────────────────────────────────────

  app.get("/api/rota-tasks", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const rotaTasks = await storage.getRotaTasks(req.workspaceId!);
      res.json(rotaTasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rota tasks" });
    }
  });

  app.post("/api/rota-tasks", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertRotaTaskSchema.parse({ ...req.body, workspaceId: req.workspaceId });
      const rotaTask = await storage.createRotaTask(data);
      broadcastUpdate("rota-tasks", req.workspaceId);
      res.json(rotaTask);
    } catch (error) {
      console.error("Error creating rota task:", error);
      if (error instanceof ZodError) {
        res.status(400).json({ message: error.errors[0]?.message ?? "Invalid rota task data" });
      } else {
        res.status(500).json({ message: "Failed to create rota task" });
      }
    }
  });

  app.put("/api/rota-tasks/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const existing = await storage.getRotaTask(req.params.id, req.workspaceId);
      if (!existing) return res.status(403).json({ message: "Forbidden" });
      const data = insertRotaTaskSchema.partial().parse(req.body);
      const rotaTask = await storage.updateRotaTask(req.params.id, data);
      broadcastUpdate("rota-tasks", req.workspaceId);
      res.json(rotaTask);
    } catch (error) {
      console.error("Error updating rota task:", error);
      if (error instanceof ZodError) {
        res.status(400).json({ message: error.errors[0]?.message ?? "Invalid rota task data" });
      } else {
        res.status(500).json({ message: "Failed to update rota task" });
      }
    }
  });

  app.delete("/api/rota-tasks/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const existing = await storage.getRotaTask(req.params.id, req.workspaceId);
      if (!existing) return res.status(403).json({ message: "Forbidden" });
      const result = await storage.deleteRotaTask(req.params.id);
      broadcastUpdate("rota-tasks", req.workspaceId);
      // Also broadcast assignments deletion since rota task deletion cascades to remove all rota-generated assignments
      if (result.deletedAssignments > 0) {
        broadcastUpdate("assignments", req.workspaceId);
      }
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error deleting rota task:", error);
      res.status(500).json({ message: "Failed to delete rota task" });
    }
  });

  // Auto-apply all rota tasks for a given week, creating any missing assignment rows.
  // Idempotent: tombstone table + unique partial DB index make this safe under
  // concurrent requests from multiple tabs/devices.
  app.post("/api/rota-tasks/apply", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { weekStartDate } = z.object({ weekStartDate: isoDateString }).parse(req.body);
      const created = await storage.applyRotaTasksForWeek(req.workspaceId!, weekStartDate);
      // Broadcast each newly created assignment individually so other tabs can
      // merge them into their local cache without a full refetch.
      for (const assignment of created) {
        broadcastUpdate("assignments", req.workspaceId, { action: "create", record: assignment });
      }
      res.json(created);
    } catch (error) {
      console.error("Error applying rota tasks:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "Invalid weekStartDate" });
      }
      res.status(500).json({ message: "Failed to apply rota tasks" });
    }
  });

  // ── Assignments (workspace-scoped) ──────────────────────────────────────────

  app.get("/api/assignments", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { weekStartDate, startDate, endDate } = req.query;

      if (startDate && endDate && typeof startDate === "string" && typeof endDate === "string") {
        const msInDay = 86_400_000;
        const rangeMs = new Date(endDate).getTime() - new Date(startDate).getTime();
        if (rangeMs > 366 * msInDay) {
          return res.status(400).json({ message: "Date range must not exceed 366 days" });
        }
        return res.json(await storage.getAssignmentsByDateRange(startDate, endDate, req.workspaceId!));
      }
      if (weekStartDate && typeof weekStartDate === "string") {
        return res.json(await storage.getAssignmentsByWeek(weekStartDate, req.workspaceId!));
      }
      res.json(await storage.getAssignments(req.workspaceId!));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  app.post("/api/assignments/bulk", isAuthenticated, requireWorkspace, async (req: any, res) => {
    try {
      const rawItems = req.body as any[];
      const items = z.array(insertAssignmentSchema).parse(
        rawItems.map((item: any) => ({ ...item, workspaceId: req.workspaceId }))
      );
      const userId = req.user.claims.sub;
      // Merge customColor back in — it is stripped by insertAssignmentSchema.parse if the
      // drizzle-zod cache predates the column addition, so pass it through explicitly.
      const created = await Promise.all(
        items.map((data, i) =>
          storage.createAssignment(
            { ...data, customColor: rawItems[i]?.customColor || null },
            userId,
          )
        )
      );
      created.forEach((assignment) =>
        broadcastUpdate("assignments", req.workspaceId, { action: "create", record: assignment })
      );

      // Notify assignees who are different users from the creator
      try {
        const creator = await storage.getUser(userId);
        const creatorName = creator?.firstName
          ? `${creator.firstName}${creator.lastName ? " " + creator.lastName : ""}`
          : creator?.email
            ? creator.email.split("@")[0]
            : "Someone";
        await Promise.all(
          created.map(async (assignment) => {
            const person = await storage.getPerson(assignment.personId);
            let task;
            if (person?.userId && person.userId !== userId) {
              task = await storage.getTask(assignment.taskId);
              await storage.createNotification({
                userId: person.userId,
                workspaceId: req.workspaceId,
                type: "assignment_created",
                title: `New assignment: ${assignment.customName ?? task?.name ?? "Task"}`,
                body: `${assignment.day} · Week of ${assignment.weekStartDate} · Assigned by ${creatorName}`,
                relatedEntityType: "assignment",
                relatedEntityId: assignment.id,
              });
            }
            if (isSlackEnabled() && assignment.slackChangeNotify === 1 && person?.slackUserId) {
              if (!task) task = await storage.getTask(assignment.taskId);
              const taskLabel = assignment.customName ?? task?.name ?? "a task";
              const notesLine = assignment.notes ? `\n> _${assignment.notes}_` : "";
              const link = buildSchedulerLink(assignment.weekStartDate);
              sendSlackDM(
                person.slackUserId,
                `:calendar: You've been assigned *${taskLabel}* on *${assignment.day}* (week of ${assignment.weekStartDate}).${notesLine}${link}`,
              ).catch((err) => console.error("[slack] Bulk assignment create DM failed:", err));
            }
          })
        );
      } catch (notifErr) {
        console.error("Bulk notification creation error:", notifErr);
      }

      res.json(created);
    } catch (error) {
      console.error("Bulk assignment error:", error);
      res.status(400).json({ message: "Invalid assignment data" });
    }
  });

  app.post("/api/assignments", isAuthenticated, requireWorkspace, async (req: any, res) => {
    try {
      const { override, customColor, ...bodyData } = req.body;
      const data = insertAssignmentSchema.parse({ ...bodyData, workspaceId: req.workspaceId });
      const userId = req.user.claims.sub;
      const assignment = await storage.createAssignment(
        { ...data, customColor: customColor || null },
        userId,
      );
      // Fix Issue 1: send the actual record so clients can update cache without refetching
      broadcastUpdate("assignments", req.workspaceId, { action: "create", record: assignment });

      // Notify the assignee if they are a different user than the creator
      try {
        const person = await storage.getPerson(assignment.personId);
        let task;
        if (person?.userId && person.userId !== userId) {
          task = await storage.getTask(assignment.taskId);
          const creator = await storage.getUser(userId);
          const creatorName = creator?.firstName
            ? `${creator.firstName}${creator.lastName ? " " + creator.lastName : ""}`
            : creator?.email
              ? creator.email.split("@")[0]
              : "Someone";
          await storage.createNotification({
            userId: person.userId,
            workspaceId: req.workspaceId,
            type: "assignment_created",
            title: `New assignment: ${assignment.customName ?? task?.name ?? "Task"}`,
            body: `${assignment.day} · Week of ${assignment.weekStartDate} · Assigned by ${creatorName}`,
            relatedEntityType: "assignment",
            relatedEntityId: assignment.id,
          });
        }
        if (isSlackEnabled() && assignment.slackChangeNotify === 1 && person?.slackUserId) {
          if (!task) task = await storage.getTask(assignment.taskId);
          const taskLabel = assignment.customName ?? task?.name ?? "a task";
          sendSlackDM(
            person.slackUserId,
            `:calendar: You've been assigned *${taskLabel}* on *${assignment.day}* (week of ${assignment.weekStartDate}).`,
          ).catch((err) => console.error("[slack] Assignment create DM failed:", err));
        }
      } catch (notifErr) {
        console.error("Notification creation error:", notifErr);
      }

      res.json(assignment);
    } catch (error) {
      console.error("Assignment validation error:", error);
      res.status(400).json({ message: "Invalid assignment data" });
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
    customColor: z.string().optional().nullable(),
    day: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]).optional(),
    weekStartDate: isoDateString.optional(),
    slackNotify: z.number().int().min(0).max(1).optional(),
    slackChangeNotify: z.number().int().min(0).max(1).optional(),
  });

  app.get("/api/assignments/trained-persons", isAuthenticated, requireWorkspace, async (req, res) => {
    const taskId = req.query.taskId as string | undefined;
    if (!taskId) return res.status(400).json({ message: "taskId is required" });
    try {
      const personIds = await storage.getTrainedPersonsByTask(taskId, req.workspaceId!);
      res.json(personIds);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trained persons" });
    }
  });

  app.patch("/api/assignments/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const existing = await storage.getAssignment(req.params.id);
      if (!existing) return res.status(404).json({ message: "Assignment not found" });

      const parsed = assignmentPatchSchema.partial().parse(req.body ?? {});
      const { weekStartDate, ...mutable } = parsed;
      const updated = await storage.updateAssignment(req.params.id, {
        ...mutable,
        weekStartDate: weekStartDate ?? existing.weekStartDate,
      });
      // Fix Issue 1: send the actual record so clients can update cache without refetching
      broadcastUpdate("assignments", req.workspaceId, { action: "update", record: updated });
      res.json(updated);

      // Slack change notifications (fire-and-forget after response)
      if (isSlackEnabled() && updated.slackChangeNotify === 1) {
        const personChanged = !!parsed.personId && parsed.personId !== existing.personId;
        (async () => {
          if (personChanged) {
            const [oldPerson, newPerson, task] = await Promise.all([
              storage.getPerson(existing.personId),
              storage.getPerson(updated.personId),
              storage.getTask(updated.taskId),
            ]);
            const taskLabel = updated.customName ?? task?.name ?? "a task";
            const oldLink = buildSchedulerLink(existing.weekStartDate);
            const newLink = buildSchedulerLink(updated.weekStartDate);
            if (oldPerson?.slackUserId) {
              const toName = newPerson?.name ? ` to *${newPerson.name}*` : "";
              await sendSlackDM(
                oldPerson.slackUserId,
                `:x: Your assignment *${taskLabel}* on *${existing.day}* (week of ${existing.weekStartDate}) has been reassigned${toName}.${oldLink}`,
              );
            }
            if (newPerson?.slackUserId) {
              const fromName = oldPerson?.name ? ` (previously assigned to *${oldPerson.name}*)` : "";
              const notesLine = updated.notes ? `\n> _${updated.notes}_` : "";
              await sendSlackDM(
                newPerson.slackUserId,
                `:calendar: You've been assigned *${taskLabel}* on *${updated.day}* (week of ${updated.weekStartDate})${fromName}.${notesLine}${newLink}`,
              );
            }
          } else {
            const meaningfulFields = ["taskId", "customName", "day", "weekStartDate", "notes", "batchNumber", "batchSize"] as const;
            const hasChange = meaningfulFields.some((f) => {
              const v = (parsed as any)[f];
              return v !== undefined && (v ?? null) !== ((existing as any)[f] ?? null);
            });
            if (!hasChange) return;
            const taskChanged = "taskId" in parsed && parsed.taskId !== undefined && existing.taskId !== updated.taskId;
            const [person, newTask, oldTask] = await Promise.all([
              storage.getPerson(updated.personId),
              storage.getTask(updated.taskId),
              taskChanged ? storage.getTask(existing.taskId) : Promise.resolve(null),
            ]);
            if (!person?.slackUserId) return;
            const taskLabel = updated.customName ?? newTask?.name ?? "a task";
            const changeSummary = buildChangeSummary(existing, updated, parsed, oldTask?.name, newTask?.name);
            const link = buildSchedulerLink(updated.weekStartDate);
            await sendSlackDM(
              person.slackUserId,
              `:pencil2: Your assignment *${taskLabel}* on *${updated.day}* (week of ${updated.weekStartDate}) has been updated.${changeSummary}${link}`,
            );
          }
        })().catch((err) => console.error("[slack] PATCH assignment notification error:", err));
      }
    } catch (error) {
      console.error("PATCH assignment error:", error);
      res.status(400).json({ message: "Invalid update data" });
    }
  });

  app.post("/api/assignments/reorder-cell", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { personId, day, weekStartDate, assignmentIds } = req.body;
      if (!personId || !day || !weekStartDate || !Array.isArray(assignmentIds)) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const result = await storage.reorderAssignmentsByCell(personId, day, weekStartDate, assignmentIds);
      broadcastUpdate("assignments", req.workspaceId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: "Failed to reorder assignments" });
    }
  });

  app.delete("/api/assignments/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      // Fetch before deleting so we can tell clients which record was removed
      const existing = await storage.getAssignment(req.params.id);
      const personForSlack = (isSlackEnabled() && existing?.slackChangeNotify === 1)
        ? await storage.getPerson(existing.personId)
        : null;
      const taskForSlack = personForSlack?.slackUserId
        ? await storage.getTask(existing!.taskId)
        : null;
      await storage.deleteAssignment(req.params.id);
      // Fix Issue 1: send id + weekStartDate so clients can remove from cache without refetching
      broadcastUpdate("assignments", req.workspaceId, {
        action: "delete",
        record: { id: req.params.id, weekStartDate: existing?.weekStartDate },
      });
      if (personForSlack?.slackUserId && existing) {
        const taskLabel = existing.customName ?? taskForSlack?.name ?? "a task";
        const link = buildSchedulerLink(existing.weekStartDate);
        sendSlackDM(
          personForSlack.slackUserId,
          `:x: Your assignment *${taskLabel}* on *${existing.day}* (week of ${existing.weekStartDate}) has been removed.${link}`,
        ).catch((err) => console.error("[slack] Assignment delete DM failed:", err));
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting assignment:", error);
      res.status(500).json({ message: "Failed to delete assignment" });
    }
  });

  app.delete("/api/assignments/series/:seriesId", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const { deletedCount } = await storage.deleteAssignmentSeries(req.params.seriesId, req.workspaceId!);
      broadcastUpdate("assignments", req.workspaceId!, {
        action: "delete-series",
        record: { seriesId: req.params.seriesId },
      });
      res.json({ success: true, deletedCount });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete assignment series" });
    }
  });

  // ── Premade Filters (workspace-scoped) ──────────────────────────────────────

  app.get("/api/premade-filters", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const filters = await storage.getPremadeFilters(req.workspaceId!);
      res.json(filters);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch premade filters" });
    }
  });

  app.post("/api/premade-filters", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const data = insertPremadeFilterSchema.parse({ ...req.body, workspaceId: req.workspaceId });
      const filter = await storage.createPremadeFilter(data);
      broadcastUpdate("premade-filters", req.workspaceId);
      res.json(filter);
    } catch (error) {
      res.status(400).json({ message: "Invalid filter data" });
    }
  });

  app.put("/api/premade-filters/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      const filter = await storage.updatePremadeFilter(req.params.id, req.body);
      broadcastUpdate("premade-filters", req.workspaceId);
      res.json(filter);
    } catch (error) {
      res.status(400).json({ message: "Failed to update premade filter" });
    }
  });

  app.delete("/api/premade-filters/:id", isAuthenticated, requireWorkspace, async (req, res) => {
    try {
      await storage.deletePremadeFilter(req.params.id);
      broadcastUpdate("premade-filters", req.workspaceId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete premade filter" });
    }
  });

  // ─── Notifications ─────────────────────────────────────────────────────────

  app.get("/api/notifications", isAuthenticated, requireWorkspace, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const items = await storage.getNotificationsForUser(userId, req.workspaceId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/mark-read", isAuthenticated, requireWorkspace, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.markAllNotificationsRead(userId, req.workspaceId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", isAuthenticated, requireWorkspace, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.deleteNotification(req.params.id, userId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // Site announcement routes
  app.get("/api/site-announcement/active", isAuthenticated, async (_req, res) => {
    try {
      const announcement = await storage.getActiveSiteAnnouncement();
      res.json(announcement ?? null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch site announcement" });
    }
  });

  app.get("/api/site-announcements", isAuthenticated, async (_req, res) => {
    try {
      const announcements = await storage.getAllSiteAnnouncements();
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch site announcements" });
    }
  });

  app.post("/api/site-announcements", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { message, type, startsAt, expiresAt } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }
      const validTypes = ["info", "warning", "success", "error", "announcement", "maintenance", "update"];
      const announcementType = validTypes.includes(type) ? (type as string) : "info";
      const createdById = req.user.claims.sub;
      const parsedStartsAt = startsAt ? new Date(startsAt) : null;
      const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
      if (parsedStartsAt && isNaN(parsedStartsAt.getTime())) return res.status(400).json({ message: "Invalid starts at date" });
      if (parsedExpiresAt && isNaN(parsedExpiresAt.getTime())) return res.status(400).json({ message: "Invalid expires at date" });
      const announcement = await storage.createSiteAnnouncement({ message: message.trim(), type: announcementType, createdById, startsAt: parsedStartsAt, expiresAt: parsedExpiresAt });
      res.json(announcement);
    } catch (error) {
      console.error("Failed to create site announcement:", error);
      res.status(500).json({ message: "Failed to create site announcement" });
    }
  });

  app.patch("/api/site-announcements/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { message, type, startsAt, expiresAt } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }
      const validTypes = ["info", "warning", "success", "error", "announcement", "maintenance", "update"];
      const announcementType = validTypes.includes(type) ? (type as string) : "info";
      const parsedStartsAt = startsAt ? new Date(startsAt) : null;
      const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
      if (parsedStartsAt && isNaN(parsedStartsAt.getTime())) return res.status(400).json({ message: "Invalid starts at date" });
      if (parsedExpiresAt && isNaN(parsedExpiresAt.getTime())) return res.status(400).json({ message: "Invalid expires at date" });
      const announcement = await storage.updateSiteAnnouncement(req.params.id, { message: message.trim(), type: announcementType, startsAt: parsedStartsAt, expiresAt: parsedExpiresAt });
      res.json(announcement);
    } catch (error) {
      console.error("Failed to update site announcement:", error);
      res.status(500).json({ message: "Failed to update site announcement" });
    }
  });

  app.patch("/api/site-announcements/:id/activate", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const announcement = await storage.activateSiteAnnouncement(req.params.id);
      res.json(announcement);
    } catch (error) {
      res.status(500).json({ message: "Failed to activate site announcement" });
    }
  });

  app.patch("/api/site-announcements/:id/deactivate", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const announcement = await storage.deactivateSiteAnnouncement(req.params.id);
      res.json(announcement);
    } catch (error) {
      res.status(500).json({ message: "Failed to deactivate site announcement" });
    }
  });

  app.delete("/api/site-announcements/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      await storage.deleteSiteAnnouncement(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete site announcement" });
    }
  });

  // ─── Slack Events API ────────────────────────────────────────────────────
  // Receives direct messages from users and replies with their week schedule.
  // Requires SLACK_SIGNING_SECRET env var and the message.im bot event subscription.
  app.post("/slack/events", async (req, res) => {
    const body = req.body as any;

    // Respond to the one-time URL verification challenge before anything else
    if (body.type === "url_verification") {
      return res.json({ challenge: body.challenge });
    }

    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    const timestamp = req.headers["x-slack-request-timestamp"] as string | undefined;
    const signature = req.headers["x-slack-signature"] as string | undefined;

    if (signingSecret) {
      if (!timestamp || !signature) {
        return res.status(403).json({ error: "Missing Slack signature headers" });
      }
      const rawBody = (req as any).rawBody as Buffer | undefined;
      if (!verifySlackSignature(signingSecret, timestamp, rawBody ?? JSON.stringify(req.body), signature)) {
        return res.status(403).json({ error: "Invalid Slack signature" });
      }
    } else {
      console.warn("[slack-events] SLACK_SIGNING_SECRET not set — skipping signature verification");
    }

    // Acknowledge immediately so Slack doesn't retry (3 s deadline)
    res.status(200).send();

    if (body.type !== "event_callback") return;
    const event = body.event;
    if (!event) return;

    // App Home opened — publish the home tab view
    if (event.type === "app_home_opened" && (event.tab === "home" || !event.tab)) {
      const slackUserId = event.user as string | undefined;
      if (!slackUserId) return;
      console.log("[slack-events] app_home_opened received for user:", slackUserId, "tab:", event.tab);
      try {
        const isRegistered = await storage.isSlackUserIdRegistered(slackUserId);
        const today = getTodayInfo();
        const nextWeekStartDate = getOffsetMondayUTC(1);
        const [rows, nextWeekRows] = isRegistered
          ? await Promise.all([
              storage.getWeekAssignmentsForSlackUserId(slackUserId, today.weekStartDate),
              storage.getWeekAssignmentsForSlackUserId(slackUserId, nextWeekStartDate),
            ])
          : [[], []];
        const blocks = buildAppHomeBlocks(rows, today.weekStartDate, isRegistered, today, nextWeekRows, nextWeekStartDate);
        await publishAppHome(slackUserId, blocks);
        console.log("[slack-events] App Home published successfully for user:", slackUserId);
      } catch (err) {
        console.error("[slack-events] Error handling app_home_opened:", err);
      }
      return;
    }

    // Ignore bot messages, edits, deletions, and non-message events
    if (event.type !== "message" || event.bot_id || event.subtype) return;

    const slackUserId = event.user as string | undefined;
    if (!slackUserId) return;

    try {
      const personExists = await storage.isSlackUserIdRegistered(slackUserId);
      if (!personExists) {
        await sendSlackDM(
          slackUserId,
          "👋 Your Slack account isn't linked to anyone in the Lab Scheduler. Ask an admin to add your Slack Member ID in the People settings.",
        );
        return;
      }

      const text = ((event.text as string) ?? "").replace(/ /g, " ").toLowerCase().trim();
      const today = getTodayInfo();
      // Map UTC day index (0=Sun,1=Mon…6=Sat) to WEEKDAYS array index (0=Mon…4=Fri)
      const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

      if (text.includes("today")) {
        const weekRows = await storage.getWeekAssignmentsForSlackUserId(slackUserId, today.weekStartDate);
        if (WEEKDAYS.includes(today.dayName)) {
          const dayOffset = WEEKDAYS.indexOf(today.dayName);
          const targetDate = new Date(today.weekStartDate + "T00:00:00Z");
          targetDate.setUTCDate(targetDate.getUTCDate() + dayOffset);
          await sendSlackDM(slackUserId, formatDayScheduleMessage(weekRows, today.dayName, targetDate));
        } else {
          await sendSlackDM(slackUserId, "📅 Today is a weekend — no lab assignments scheduled. Try *next week* to see what's coming up.");
        }
      } else if (text.includes("tomorrow")) {
        if (today.utcDayIndex >= 1 && today.utcDayIndex <= 4) {
          // Mon–Thu: tomorrow is a weekday in the same week
          const tomorrowWeekdayIdx = today.utcDayIndex; // utcDayIndex 1=Mon → WEEKDAYS[1]=Tuesday ✓
          const tomorrowName = WEEKDAYS[tomorrowWeekdayIdx];
          const targetDate = new Date(today.weekStartDate + "T00:00:00Z");
          targetDate.setUTCDate(targetDate.getUTCDate() + tomorrowWeekdayIdx);
          const weekRows = await storage.getWeekAssignmentsForSlackUserId(slackUserId, today.weekStartDate);
          await sendSlackDM(slackUserId, formatDayScheduleMessage(weekRows, tomorrowName, targetDate));
        } else if (today.utcDayIndex === 5) {
          // Friday: next working day is Monday next week
          const nextMonday = getOffsetMondayUTC(1);
          const targetDate = new Date(nextMonday + "T00:00:00Z");
          const weekRows = await storage.getWeekAssignmentsForSlackUserId(slackUserId, nextMonday);
          const dayMsg = formatDayScheduleMessage(weekRows, "Monday", targetDate);
          await sendSlackDM(slackUserId, `📅 Tomorrow is Saturday — your next working day is Monday.\n\n${dayMsg}`);
        } else {
          // Weekend
          await sendSlackDM(slackUserId, "📅 It's the weekend — no assignments tomorrow. Try *next week* to see what's coming up.");
        }
      } else if (text.includes("next week")) {
        const nextMonday = getOffsetMondayUTC(1);
        const rows = await storage.getWeekAssignmentsForSlackUserId(slackUserId, nextMonday);
        await sendSlackDM(slackUserId, formatWeekScheduleMessage(rows, nextMonday));
      } else if (text.includes("this week") || text.includes("week")) {
        const weekStartDate = getMondayUTC();
        const rows = await storage.getWeekAssignmentsForSlackUserId(slackUserId, weekStartDate);
        await sendSlackDM(slackUserId, formatWeekScheduleMessage(rows, weekStartDate));
      } else {
        // Unrecognised command: show help then this week's schedule
        const helpText = [
          "👋 *Lab Scheduler Bot*",
          "",
          "You can send me these commands:",
          "• *today* — your assignments for today",
          "• *tomorrow* — your assignments for tomorrow",
          "• *this week* — your full schedule for this week",
          "• *next week* — your full schedule for next week",
          "• anything else — your full schedule for this week",
          "",
        ].join("\n");
        const weekStartDate = getMondayUTC();
        const rows = await storage.getWeekAssignmentsForSlackUserId(slackUserId, weekStartDate);
        await sendSlackDM(slackUserId, helpText + formatWeekScheduleMessage(rows, weekStartDate));
      }
    } catch (err) {
      console.error("[slack-events] Error handling message event:", err);
    }
  });

  return httpServer;
}
