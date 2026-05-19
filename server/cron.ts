import cron from "node-cron";
import { storage } from "./storage.js";
import { sendSlackDM, isSlackEnabled, getOffsetMondayUTC, formatWeekScheduleMessage } from "./slack.js";

export function startCron(): void {
  if (!isSlackEnabled()) {
    console.log("[cron] SLACK_BOT_TOKEN not set — Slack reminder cron will not run");
    return;
  }

  // 8 AM Mon–Fri
  cron.schedule("0 8 * * 1-5", async () => {
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

  console.log("[cron] Daily Slack reminder cron scheduled at 08:00 Mon–Fri");

  // Friday 8 AM UTC — preview of next week's schedule for all Slack-linked users
  cron.schedule("0 8 * * 5", async () => {
    console.log("[cron] Running Friday next-week preview DMs");
    try {
      const nextMonday = getOffsetMondayUTC(1);
      const slackIds = await storage.getPeopleWithSlackIdsForWeek(nextMonday);
      if (slackIds.length === 0) return;

      const results = await Promise.allSettled(
        slackIds.map(async (slackUserId) => {
          const rows = await storage.getWeekAssignmentsForSlackUserId(slackUserId, nextMonday);
          const msg = formatWeekScheduleMessage(rows, nextMonday);
          return sendSlackDM(slackUserId, `📋 *Preview for next week:*\n\n${msg}`);
        }),
      );

      const sent = results.filter((r) => r.status === "fulfilled" && (r as any).value === true).length;
      const failed = results.length - sent;
      if (failed > 0) {
        console.warn(`[cron] Friday preview: ${sent} sent, ${failed} failed`);
      } else {
        console.log(`[cron] Friday preview: sent ${sent} DM(s)`);
      }
    } catch (err) {
      console.error("[cron] Error running Friday preview:", err);
    }
  });

  console.log("[cron] Friday next-week preview cron scheduled at 08:00 on Fridays");
}
