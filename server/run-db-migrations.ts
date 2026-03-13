import { runDatabaseMigrations } from "./init-db";

(async () => {
  try {
    console.log("Starting manual database migrations...");
    await runDatabaseMigrations();
    console.log("Manual database migrations completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Manual database migrations failed:", error);
    process.exit(1);
  }
})();
