import { storage } from "./storage";

export async function initializeDatabase() {
  try {
    const existingPeople = await storage.getPeople();
    
    // Only initialize if database is empty
    if (existingPeople.length > 0) {
      console.log("Database already initialized, skipping sample data");
      return;
    }

    console.log("Initializing database with sample data...");

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
    for (const p of samplePeople) {
      const created = await storage.createPerson(p);
      peopleIds.push(created.id);
    }

    const taskIds: string[] = [];
    for (const t of sampleTasks) {
      const created = await storage.createTask(t);
      taskIds.push(created.id);
    }

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

    const sampleAssignments = [
      {
        taskId: taskIds[0],
        personId: peopleIds[0],
        day: "Monday" as const,
        period: "AM" as const,
        weekStartDate: currentWeekStart,
        batchNumber: "B-2024-001",
        notes: null,
        date: null,
      },
      {
        taskId: taskIds[1],
        personId: peopleIds[0],
        day: "Monday" as const,
        period: "PM" as const,
        weekStartDate: currentWeekStart,
        batchNumber: null,
        notes: null,
        date: null,
      },
      {
        taskId: taskIds[0],
        personId: peopleIds[1],
        day: "Tuesday" as const,
        period: "AM" as const,
        weekStartDate: currentWeekStart,
        batchNumber: "B-2024-002",
        notes: "Priority sample",
        date: null,
      },
      {
        taskId: taskIds[2],
        personId: peopleIds[2],
        day: "Wednesday" as const,
        period: "PM" as const,
        weekStartDate: currentWeekStart,
        batchNumber: null,
        notes: null,
        date: null,
      },
    ];

    for (const assignment of sampleAssignments) {
      await storage.createAssignment(assignment);
    }

    console.log("Database initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
}
