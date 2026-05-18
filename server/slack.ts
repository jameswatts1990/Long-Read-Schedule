type SlackClient = {
  chat: {
    postMessage(input: { channel: string; text: string }): Promise<unknown>;
  };
};

let client: SlackClient | null = null;

async function getClient(): Promise<SlackClient | null> {
  if (!process.env.SLACK_BOT_TOKEN) return null;
  if (!client) {
    try {
      const mod = await import("@slack/web-api");
      client = new mod.WebClient(process.env.SLACK_BOT_TOKEN);
    } catch {
      console.warn("[slack] @slack/web-api is not installed — Slack messages will not be sent");
      return null;
    }
  }
  return client;
}

export async function sendSlackDM(slackUserId: string, text: string): Promise<void> {
  const slack = await getClient();
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
