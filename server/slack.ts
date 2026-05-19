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

type WeekRow = {
  day: string;
  taskName: string;
  taskColor: string;
  customName: string | null;
  batchNumber: string | null;
  batchSize: number | null;
  notes: string | null;
  workspaceName: string;
};

function renderWeekRows(
  rows: WeekRow[],
  weekStartDate: string,
  todayDayName?: string,
  tomorrowDayName?: string,
): object[] {
  const monday = new Date(weekStartDate + "T00:00:00Z");
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  const blocks: object[] = [];
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*📅 ${fmt(monday)} – ${fmt(friday)}*` },
  });
  blocks.push({ type: "divider" });

  const byWorkspace = new Map<string, WeekRow[]>();
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
    return blocks;
  }

  const multiWorkspace = byWorkspace.size > 1;
  for (const [wsName, wsRows] of byWorkspace) {
    if (multiWorkspace) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${wsName}*` } });
    }
    for (const day of WEEKDAYS) {
      const dayRows = wsRows.filter((r) => r.day === day);
      const isToday = day === todayDayName;
      const isTomorrow = day === tomorrowDayName;
      const dayLabel = isToday ? `📍 *${day}* _(today)_` : isTomorrow ? `🔜 *${day}* _(tomorrow)_` : `*${day}*`;

      let text: string;
      if (dayRows.length === 0) {
        text = `${dayLabel} — _nothing scheduled_ ✅`;
      } else {
        const lines = [dayLabel];
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
  return blocks;
}

export function buildAppHomeBlocks(
  rows: WeekRow[],
  weekStartDate: string,
  isRegistered: boolean,
  todayInfo?: { dayName: string; utcDayIndex: number },
  nextWeekRows?: WeekRow[],
  nextWeekStartDate?: string,
): object[] {
  const blocks: object[] = [];
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "📋 Lab Scheduler", emoji: true },
  });

  const descText = appUrl
    ? `Schedule and track your team's weekly lab work. <${appUrl}|Open the web app →>`
    : "Schedule and track your team's weekly lab work.";
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: descText }],
  });

  if (!isRegistered) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*👋 Your account isn't linked yet*\n\nLab Scheduler helps your team plan who's doing what each day of the week.\n\n*To get set up:*\n*1.* Ask a workspace admin to add your *Slack Member ID* to your person record in the People settings.\n*2.* Once linked, your weekly schedule will appear here each time you open this tab.\n*3.* You can also message me directly — try *today* or *this week* once you're linked.",
      },
    });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "💡 Your Slack Member ID: open your Slack profile → *⋮ More* → *Copy member ID*." }],
    });
    return blocks;
  }

  // ── Today card (weekdays only) ─────────────────────────────────────────────
  const isWeekday = todayInfo && todayInfo.utcDayIndex >= 1 && todayInfo.utcDayIndex <= 5;
  if (isWeekday && todayInfo) {
    blocks.push({ type: "divider" });
    const todayDate = new Date(weekStartDate + "T00:00:00Z");
    todayDate.setUTCDate(todayDate.getUTCDate() + (todayInfo.utcDayIndex - 1));
    const todayLabel = todayDate.toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*📍 Today — ${todayLabel}*` },
    });
    const todayRows = rows.filter((r) => r.day === todayInfo.dayName);
    if (todayRows.length === 0) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "_Nothing scheduled for you today_ ✅" },
      });
    } else {
      const byWs = new Map<string, WeekRow[]>();
      for (const row of todayRows) {
        const bucket = byWs.get(row.workspaceName) ?? [];
        bucket.push(row);
        byWs.set(row.workspaceName, bucket);
      }
      const multiWs = byWs.size > 1;
      for (const [wsName, wsRows] of byWs) {
        const lines: string[] = [];
        if (multiWs) lines.push(`*${wsName}*`);
        for (const r of wsRows) {
          const label = r.customName ?? r.taskName;
          let line = `${colorToEmoji(r.taskColor)} ${label}`;
          if (r.batchNumber != null && r.batchSize != null) line += ` _(batch ${r.batchNumber} of ${r.batchSize})_`;
          else if (r.batchNumber != null) line += ` _(batch ${r.batchNumber})_`;
          if (r.notes) line += ` — ${r.notes}`;
          lines.push(line);
        }
        blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } });
      }
    }
  }

  // ── Week schedule ──────────────────────────────────────────────────────────
  blocks.push({ type: "divider" });

  const tomorrowName: string | undefined =
    todayInfo && todayInfo.utcDayIndex >= 1 && todayInfo.utcDayIndex <= 4
      ? WEEKDAYS[todayInfo.utcDayIndex]
      : undefined;

  blocks.push(...renderWeekRows(rows, weekStartDate, todayInfo?.dayName, tomorrowName));

  if (nextWeekRows && nextWeekStartDate) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*🗓️ Next Week*" } });
    blocks.push(...renderWeekRows(nextWeekRows, nextWeekStartDate));
  }

  // ── About & commands ───────────────────────────────────────────────────────
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*💡 About Lab Scheduler*\nLab Scheduler helps your team plan and track week-by-week lab work — tasks, batches, and notes all in one place. Use the web app for full scheduling, filters, reporting, and admin tools.\n\n*💬 Bot Commands*\nMessage me directly:\n• *today* — your assignments for today\n• *tomorrow* — your assignments for tomorrow\n• *this week* — your full schedule for this week\n• *next week* — your full schedule for next week",
    },
  });

  if (appUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open Scheduler →", emoji: true },
          url: appUrl,
          action_id: "open_scheduler",
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "🔄 This view refreshes each time you open the Home tab." }],
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

// ─── Notification helpers ──────────────────────────────────────────────────

export function buildSchedulerLink(weekStartDate: string): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) return "";
  return `\n<${appUrl}/?week=${weekStartDate}|View your schedule →>`;
}

type AssignmentRow = {
  taskId: string;
  customName: string | null;
  day: string;
  weekStartDate: string;
  notes: string | null;
  batchNumber: string | null;
  batchSize: number | null;
};

export function buildChangeSummary(
  existing: AssignmentRow,
  updated: AssignmentRow,
  parsed: Partial<AssignmentRow>,
  oldTaskName?: string | null,
  newTaskName?: string | null,
): string {
  const bullets: string[] = [];

  if ("day" in parsed && parsed.day !== undefined && existing.day !== updated.day) {
    bullets.push(`• Day: ${existing.day} → ${updated.day}`);
  }
  if ("weekStartDate" in parsed && parsed.weekStartDate !== undefined && existing.weekStartDate !== updated.weekStartDate) {
    bullets.push(`• Week: ${existing.weekStartDate} → ${updated.weekStartDate}`);
  }
  if ("taskId" in parsed && parsed.taskId !== undefined && existing.taskId !== updated.taskId) {
    const from = oldTaskName ?? existing.taskId;
    const to = newTaskName ?? updated.taskId;
    bullets.push(`• Task: ${from} → ${to}`);
  }
  if ("customName" in parsed && parsed.customName !== undefined && (existing.customName ?? null) !== (updated.customName ?? null)) {
    if (!updated.customName) {
      bullets.push(`• Name: removed`);
    } else if (!existing.customName) {
      bullets.push(`• Name: set to "${updated.customName}"`);
    } else {
      bullets.push(`• Name: "${existing.customName}" → "${updated.customName}"`);
    }
  }
  if ("notes" in parsed && parsed.notes !== undefined && (existing.notes ?? null) !== (updated.notes ?? null)) {
    if (!updated.notes) {
      bullets.push(`• Notes: removed`);
    } else if (!existing.notes) {
      bullets.push(`• Notes: added — _${updated.notes}_`);
    } else {
      bullets.push(`• Notes: updated — _${updated.notes}_`);
    }
  }
  const batchChanged =
    ("batchNumber" in parsed && parsed.batchNumber !== undefined && (existing.batchNumber ?? null) !== (updated.batchNumber ?? null)) ||
    ("batchSize" in parsed && parsed.batchSize !== undefined && (existing.batchSize ?? null) !== (updated.batchSize ?? null));
  if (batchChanged) {
    const fromBatch = existing.batchNumber != null
      ? (existing.batchSize != null ? `${existing.batchNumber} of ${existing.batchSize}` : `${existing.batchNumber}`)
      : "none";
    const toBatch = updated.batchNumber != null
      ? (updated.batchSize != null ? `${updated.batchNumber} of ${updated.batchSize}` : `${updated.batchNumber}`)
      : "none";
    bullets.push(`• Batch: ${fromBatch} → ${toBatch}`);
  }

  if (bullets.length === 0) return "";
  return `\n*What changed:*\n${bullets.join("\n")}`;
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
