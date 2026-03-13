// Fix Issue 9: reuse the shared DB pool from storage instead of creating a second connection
import { storage, sharedDb as db } from "./storage";
import { people, tasks, assignments, premadeFilters } from "@shared/schema";
import { isNull, or, eq } from "drizzle-orm";

const MIGRATION_MODE_ENV = "DB_MIGRATION_MODE";

async function ensureDefaultWorkspace(): Promise<string> {
  const allWorkspaces = await storage.getWorkspaces();

  if (allWorkspaces.length === 0) {
    console.log("Creating default workspace...");
    const defaultWs = await storage.createWorkspace({
      name: "Default Workspace",
      description: "The default lab workspace",
    });
    console.log(`Created default workspace: ${defaultWs.id}`);
    return defaultWs.id;
  }

  return allWorkspaces[0].id;
}

async function runWorkspaceNormalizationMigration(defaultWorkspaceId: string) {
  console.log("Running workspace normalization migration...");

  await db
    .update(people)
    .set({ workspaceId: defaultWorkspaceId })
    .where(or(isNull(people.workspaceId), eq(people.workspaceId, "default")));

  await db
    .update(tasks)
    .set({ workspaceId: defaultWorkspaceId })
    .where(or(isNull(tasks.workspaceId), eq(tasks.workspaceId, "default")));

  await db
    .update(assignments)
    .set({ workspaceId: defaultWorkspaceId })
    .where(or(isNull(assignments.workspaceId), eq(assignments.workspaceId, "default")));

  await db
    .update(premadeFilters)
    .set({ workspaceId: defaultWorkspaceId })
    .where(or(isNull(premadeFilters.workspaceId), eq(premadeFilters.workspaceId, "default")));

  const allUsers = await storage.getUsers();
  for (const user of allUsers) {
    const existing = await storage.getUserWorkspaceMembership(user.id, defaultWorkspaceId);
    if (!existing) {
      console.log(`Adding user ${user.email || user.id} to default workspace`);
      await storage.addUserToWorkspace(user.id, defaultWorkspaceId, "member");
    }
  }

  console.log("Workspace normalization migration completed.");
}

function isMigrationModeEnabled() {
  return process.env[MIGRATION_MODE_ENV] === "true";
}

export async function runDatabaseMigrations() {
  const defaultWorkspaceId = await ensureDefaultWorkspace();
  await runWorkspaceNormalizationMigration(defaultWorkspaceId);
}

export async function initializeDatabase() {
  try {
    const defaultWorkspaceId = await ensureDefaultWorkspace();

    if (isMigrationModeEnabled()) {
      console.log(
        `${MIGRATION_MODE_ENV}=true detected; running database migration tasks during startup.`,
      );
      await runWorkspaceNormalizationMigration(defaultWorkspaceId);
    }

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
