import { WebClient } from "@slack/web-api";

let client: WebClient | null = null;

function getClient(): WebClient | null {
  if (!process.env.SLACK_BOT_TOKEN) return null;
  if (!client) client = new WebClient(process.env.SLACK_BOT_TOKEN);
  return client;
}

export async function sendSlackDM(slackUserId: string, text: string): Promise<void> {
  const slack = getClient();
  if (!slack) {
    console.warn("[slack] SLACK_BOT_TOKEN not set — skipping DM to", slackUserId);
    return;
  }
  try {
    await slack.chat.postMessage({ channel: slackUserId, text });
  } catch (err) {
    console.error("[slack] Failed to send DM to", slackUserId, err);
  }
}

export function isSlackEnabled(): boolean {
  return !!process.env.SLACK_BOT_TOKEN;
}
