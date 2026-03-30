// Fix Issue 9: reuse the shared DB pool from storage instead of creating a second connection
import { storage, sharedDb as db } from "./storage";
import { people, tasks, assignments, premadeFilters } from "@shared/schema";
import { isNull, or, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function initializeDatabase() {
  try {
    // ── Step 0: Ensure latest rota-related columns exist ─────────────────────
    await db.execute(sql`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS rota_task_id varchar`);
    await db.execute(sql`ALTER TABLE rota_tasks ADD COLUMN IF NOT EXISTS end_after_occurrences integer`);
    await db.execute(sql`ALTER TABLE rota_tasks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);
    await db.execute(sql`ALTER TABLE rota_tasks ADD COLUMN IF NOT EXISTS archived_at timestamp`);

    // ── Step 1: Ensure at least one workspace exists ─────────────────────────
    const allWorkspaces = await storage.getWorkspaces();
    let defaultWorkspaceId: string;

    if (allWorkspaces.length === 0) {
      console.log("Creating default workspace...");
      const defaultWs = await storage.createWorkspace({
        name: "Default Workspace",
        description: "The default lab workspace",
      });
      defaultWorkspaceId = defaultWs.id;
      console.log(`Created default workspace: ${defaultWorkspaceId}`);
    } else {
      defaultWorkspaceId = allWorkspaces[0].id;
    }

    // ── Step 2: Migrate any rows missing workspaceId ─────────────────────────
    // People
    await db
      .update(people)
      .set({ workspaceId: defaultWorkspaceId })
      .where(or(isNull(people.workspaceId), eq(people.workspaceId, "default")));

    // Tasks
    await db
      .update(tasks)
      .set({ workspaceId: defaultWorkspaceId })
      .where(or(isNull(tasks.workspaceId), eq(tasks.workspaceId, "default")));

    // Assignments
    await db
      .update(assignments)
      .set({ workspaceId: defaultWorkspaceId })
      .where(or(isNull(assignments.workspaceId), eq(assignments.workspaceId, "default")));

    // Premade Filters
    await db
      .update(premadeFilters)
      .set({ workspaceId: defaultWorkspaceId })
      .where(or(isNull(premadeFilters.workspaceId), eq(premadeFilters.workspaceId, "default")));

    // ── Step 3: Ensure all existing users are members of the default workspace ─
    const allUsers = await storage.getUsers();
    for (const user of allUsers) {
      const existing = await storage.getUserWorkspaceMembership(user.id, defaultWorkspaceId);
      if (!existing) {
        console.log(`Adding user ${user.email || user.id} to default workspace`);
        await storage.addUserToWorkspace(user.id, defaultWorkspaceId, "member");
      }
    }

    // ── Step 4: Seed sample data if the default workspace is empty ───────────
    const existingPeople = await storage.getPeople(defaultWorkspaceId);
    if (existingPeople.length > 0) {
      console.log("Database already has data, skipping sample seed");
      return;
    }

    console.log("Initializing database with sample data...");

    const samplePeople = [
      { name: "Dr. Sarah Chen", color: "#3B82F6", workspaceId: defaultWorkspaceId },
      { name: "James Rodriguez", color: "#10B981", workspaceId: defaultWorkspaceId },
      { name: "Emily Watson", color: "#F59E0B", workspaceId: defaultWorkspaceId },
    ];

    const sampleTasks = [
      { name: "Cell Culture Prep", color: "#DBEAFE", description: "Prepare cell culture media and plates", workspaceId: defaultWorkspaceId },
      { name: "PCR Analysis", color: "#D1FAE5", description: "Run PCR amplification and gel analysis", workspaceId: defaultWorkspaceId },
      { name: "Sample Collection", color: "#FEF3C7", description: "Collect and process samples", workspaceId: defaultWorkspaceId },
      { name: "Equipment Maintenance", color: "#E0E7FF", description: "Regular equipment calibration and cleaning", workspaceId: defaultWorkspaceId },
    ];

    const peopleIds: string[] = [];
    for (const p of samplePeople) {
      const created = await storage.createPerson(p as any);
      peopleIds.push(created.id);
    }

    const taskIds: string[] = [];
    for (const t of sampleTasks) {
      const created = await storage.createTask(t as any);
      taskIds.push(created.id);
    }

    const getMonday = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    };
    const formatDate = (date: Date): string => date.toISOString().split("T")[0];
    const currentWeekStart = formatDate(getMonday(new Date()));

    const sampleAssignments = [
      { taskId: taskIds[0], personId: peopleIds[0], day: "Monday" as const, weekStartDate: currentWeekStart, batchNumber: "B-2024-001", workspaceId: defaultWorkspaceId },
      { taskId: taskIds[1], personId: peopleIds[0], day: "Monday" as const, weekStartDate: currentWeekStart, workspaceId: defaultWorkspaceId },
      { taskId: taskIds[0], personId: peopleIds[1], day: "Tuesday" as const, weekStartDate: currentWeekStart, batchNumber: "B-2024-002", notes: "Priority sample", workspaceId: defaultWorkspaceId },
      { taskId: taskIds[2], personId: peopleIds[2], day: "Wednesday" as const, weekStartDate: currentWeekStart, workspaceId: defaultWorkspaceId },
    ];

    for (const assignment of sampleAssignments) {
      await storage.createAssignment(assignment as any);
    }

    console.log("Database initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
}
