import cron from "node-cron";
import { storage } from "./storage.js";
import { sendSlackDM, isSlackEnabled } from "./slack.js";

export function startCron(): void {
  if (!isSlackEnabled()) {
    console.log("[cron] SLACK_BOT_TOKEN not set — Slack reminder cron will not run");
    return;
  }

  // 9 AM Mon–Fri
  cron.schedule("0 9 * * 1-5", async () => {
    console.log("[cron] Running daily Slack reminders");
    try {
      const rows = await storage.getTodaysSlackAssignments();
      if (rows.length === 0) return;

      const results = await Promise.allSettled(
        rows.map((r) =>
          sendSlackDM(
            r.slackUserId,
            `:calendar: Reminder: you have *${r.taskName}* scheduled today.`,
          ),
        ),
      );

      const sent = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
      const failed = results.length - sent;
      if (failed > 0) {
        console.warn(`[cron] Slack reminders: ${sent} sent, ${failed} failed — check logs above for details`);
      } else {
        console.log(`[cron] Sent ${sent} Slack reminder(s) successfully`);
      }
    } catch (err) {
      console.error("[cron] Error running Slack reminders:", err);
    }
  });

  console.log("[cron] Daily Slack reminder cron scheduled at 09:00 Mon–Fri");
}
