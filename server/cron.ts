import { storage } from "./storage.js";
import { sendSlackDM, isSlackEnabled } from "./slack.js";

export function startCron(): void {
  if (!isSlackEnabled()) {
    console.log("[cron] SLACK_BOT_TOKEN not set — Slack reminder cron will not run");
    return;
  }

  void import("node-cron")
    .then((cron) => {
      // 9 AM Mon–Fri
      cron.default.schedule("0 9 * * 1-5", async () => {
        console.log("[cron] Running daily Slack reminders");
        try {
          const rows = await storage.getTodaysSlackAssignments();
          if (rows.length === 0) return;

          await Promise.allSettled(
            rows.map((r) =>
              sendSlackDM(
                r.slackUserId,
                `:calendar: Reminder: you have *${r.taskName}* scheduled today.`,
              ),
            ),
          );

          console.log(`[cron] Sent ${rows.length} Slack reminder(s)`);
        } catch (err) {
          console.error("[cron] Error running Slack reminders:", err);
        }
      });

      console.log("[cron] Daily Slack reminder cron scheduled at 09:00 Mon–Fri");
    })
    .catch(() => {
      console.warn("[cron] node-cron is not installed — Slack reminder cron will not run");
    });
}
