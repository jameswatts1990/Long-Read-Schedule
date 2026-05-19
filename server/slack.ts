import { WebClient } from "@slack/web-api";
import crypto from "crypto";

let client: WebClient | null = null;

function getClient(): WebClient | null {
  if (!process.env.SLACK_BOT_TOKEN) return null;
  if (!client) client = new WebClient(process.env.SLACK_BOT_TOKEN);
  return client;
}

export async function sendSlackDM(slackUserId: string, text: string): Promise<boolean> {
  const slack = getClient();
  if (!slack) {
    console.warn("[slack] SLACK_BOT_TOKEN not set — skipping DM to", slackUserId);
    return false;
  }
  try {
    await slack.chat.postMessage({ channel: slackUserId, text });
    return true;
  } catch (err) {
    console.error("[slack] Failed to send DM to", slackUserId, err);
    return false;
  }
}

export function isSlackEnabled(): boolean {
  return !!process.env.SLACK_BOT_TOKEN;
}

export async function validateSlackToken(): Promise<void> {
  const slack = getClient();
  if (!slack) return;
  try {
    await slack.auth.test();
    console.log("[slack] Token validated successfully");
  } catch (err) {
    console.error("[slack] SLACK_BOT_TOKEN is invalid or revoked — Slack reminders will not work:", err);
  }
}

// ─── Slack Events API helpers ──────────────────────────────────────────────

export function getOffsetMondayUTC(offsetWeeks: number): string {
  const now = new Date();
  const dow = now.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff + offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export function getMondayUTC(): string {
  return getOffsetMondayUTC(0);
}

const ALL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function getTodayInfo(): { weekStartDate: string; dayName: string; utcDayIndex: number } {
  const now = new Date();
  const utcDayIndex = now.getUTCDay();
  return {
    weekStartDate: getOffsetMondayUTC(0),
    dayName: ALL_DAYS[utcDayIndex],
    utcDayIndex,
  };
}

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: Buffer | string,
  signature: string,
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

  const baseString = `v0:${timestamp}:${rawBody.toString()}`;
  const computed = `v0=${crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

function colorToEmoji(hex: string): string {
  if (!hex || hex.length < 7) return "🔘";
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 40) return max > 128 ? "⚪" : "⚫";
    let hue = 0;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
    if (hue < 20) return "🔴";
    if (hue < 45) return "🟠";
    if (hue < 75) return "🟡";
    if (hue < 165) return "🟢";
    if (hue < 255) return "🔵";
    if (hue < 300) return "🟣";
    return "🔴";
  } catch {
    return "🔘";
  }
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export function formatWeekScheduleMessage(
  rows: Array<{
    day: string;
    taskName: string;
    taskColor: string;
    customName: string | null;
    batchNumber: string | null;
    batchSize: number | null;
    notes: string | null;
    workspaceName: string;
  }>,
  weekStartDate: string,
): string {
  const monday = new Date(weekStartDate + "T00:00:00Z");
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  const header = `📅 *Your schedule for ${fmt(monday)} – ${fmt(friday)}*`;

  if (rows.length === 0) {
    return `${header}\n\n_Nothing scheduled for you this week._`;
  }

  // Group by workspace
  const byWorkspace = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byWorkspace.get(row.workspaceName) ?? [];
    bucket.push(row);
    byWorkspace.set(row.workspaceName, bucket);
  }

  const workspaceNames = [...byWorkspace.keys()];
  const multiWorkspace = workspaceNames.length > 1;
  const lines: string[] = [header, ""];

  for (const wsName of workspaceNames) {
    const wsRows = byWorkspace.get(wsName)!;
    if (multiWorkspace) lines.push(`*${wsName}*`);

    for (const day of WEEKDAYS) {
      const dayRows = wsRows.filter((r) => r.day === day);
      if (dayRows.length === 0) {
        lines.push(`*${day}* — _nothing scheduled_ ✅`);
      } else {
        lines.push(`*${day}*`);
        for (const r of dayRows) {
          const label = r.customName ?? r.taskName;
          let line = `${colorToEmoji(r.taskColor)} ${label}`;
          if (r.batchNumber != null && r.batchSize != null) {
            line += ` _(batch ${r.batchNumber} of ${r.batchSize})_`;
          } else if (r.batchNumber != null) {
            line += ` _(batch ${r.batchNumber})_`;
          }
          if (r.notes) line += ` — ${r.notes}`;
          lines.push(line);
        }
      }
    }

    if (multiWorkspace) lines.push("");
  }

  return lines.join("\n");
}

// ─── App Home Tab ──────────────────────────────────────────────────────────

export function buildAppHomeBlocks(
  rows: Array<{
    day: string;
    taskName: string;
    taskColor: string;
    customName: string | null;
    batchNumber: string | null;
    batchSize: number | null;
    notes: string | null;
    workspaceName: string;
  }>,
  weekStartDate: string,
  isRegistered: boolean,
): object[] {
  const blocks: object[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "📋 Lab Scheduler", emoji: true },
  });

  if (!isRegistered) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "👋 Your Slack account isn't linked to anyone in the Lab Scheduler.\n\nAsk an admin to add your *Slack Member ID* in the People settings.",
      },
    });
    return blocks;
  }

  const monday = new Date(weekStartDate + "T00:00:00Z");
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*Your schedule for ${fmt(monday)} – ${fmt(friday)}*` },
  });
  blocks.push({ type: "divider" });

  const byWorkspace = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byWorkspace.get(row.workspaceName) ?? [];
    bucket.push(row);
    byWorkspace.set(row.workspaceName, bucket);
  }

  if (rows.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_Nothing scheduled for you this week._ ✅" },
    });
  } else {
    const multiWorkspace = byWorkspace.size > 1;

    for (const [wsName, wsRows] of byWorkspace) {
      if (multiWorkspace) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${wsName}*` } });
      }
      for (const day of WEEKDAYS) {
        const dayRows = wsRows.filter((r) => r.day === day);
        let text: string;
        if (dayRows.length === 0) {
          text = `*${day}* — _nothing scheduled_ ✅`;
        } else {
          const lines = [`*${day}*`];
          for (const r of dayRows) {
            const label = r.customName ?? r.taskName;
            let line = `${colorToEmoji(r.taskColor)} ${label}`;
            if (r.batchNumber != null && r.batchSize != null) {
              line += ` _(batch ${r.batchNumber} of ${r.batchSize})_`;
            } else if (r.batchNumber != null) {
              line += ` _(batch ${r.batchNumber})_`;
            }
            if (r.notes) line += ` — ${r.notes}`;
            lines.push(line);
          }
          text = lines.join("\n");
        }
        blocks.push({ type: "section", text: { type: "mrkdwn", text } });
      }
      if (multiWorkspace) blocks.push({ type: "divider" });
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "💬 *Bot Commands*\nMessage me directly:\n• *today* — your assignments for today\n• *tomorrow* — your assignments for tomorrow\n• *this week* — your full schedule for this week\n• *next week* — your full schedule for next week",
    },
  });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Home tab refreshes each time you open it." }],
  });

  return blocks;
}

export async function publishAppHome(slackUserId: string, blocks: object[]): Promise<void> {
  const slack = getClient();
  if (!slack) return;
  try {
    await slack.views.publish({
      user_id: slackUserId,
      view: { type: "home", blocks: blocks as any },
    });
  } catch (err) {
    console.error("[slack] Failed to publish App Home for", slackUserId, err);
  }
}

export function formatDayScheduleMessage(
  rows: Array<{
    day: string;
    taskName: string;
    taskColor: string;
    customName: string | null;
    batchNumber: string | null;
    batchSize: number | null;
    notes: string | null;
    workspaceName: string;
  }>,
  targetDayName: string,
  targetDate: Date,
): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const header = `📅 *Your schedule for ${fmt(targetDate)}*`;

  const dayRows = rows.filter((r) => r.day === targetDayName);
  if (dayRows.length === 0) {
    return `${header}\n\n_Nothing scheduled for you on ${targetDayName}._  ✅`;
  }

  const byWorkspace = new Map<string, typeof rows>();
  for (const row of dayRows) {
    const bucket = byWorkspace.get(row.workspaceName) ?? [];
    bucket.push(row);
    byWorkspace.set(row.workspaceName, bucket);
  }

  const multiWorkspace = byWorkspace.size > 1;
  const lines: string[] = [header, ""];

  for (const [wsName, wsRows] of byWorkspace) {
    if (multiWorkspace) lines.push(`*${wsName}*`);
    for (const r of wsRows) {
      const label = r.customName ?? r.taskName;
      let line = `${colorToEmoji(r.taskColor)} ${label}`;
      if (r.batchNumber != null && r.batchSize != null) {
        line += ` _(batch ${r.batchNumber} of ${r.batchSize})_`;
      } else if (r.batchNumber != null) {
        line += ` _(batch ${r.batchNumber})_`;
      }
      if (r.notes) line += ` — ${r.notes}`;
      lines.push(line);
    }
    if (multiWorkspace) lines.push("");
  }

  return lines.join("\n");
}
