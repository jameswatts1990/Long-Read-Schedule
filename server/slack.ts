import { WebClient } from "@slack/web-api";

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
