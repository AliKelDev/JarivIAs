import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export type SlackMessage = {
  ts: string;
  user?: string;
  text?: string;
  files?: Array<{ id: string; name?: string; title?: string }>;
};

export type SlackChannel = {
  id: string;
  name: string;
  is_private: boolean;
};

async function getSlackTokenForUser(uid: string): Promise<string> {
  const doc = await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("settings")
    .doc("slack")
    .get();

  const data = doc.data();
  if (!data?.token) {
    throw new Error(
      "Slack is not connected. Please add your Slack User Token in the dashboard settings.",
    );
  }
  return data.token as string;
}

export async function listSlackChannelsForUser(
  uid: string,
): Promise<SlackChannel[]> {
  const token = await getSlackTokenForUser(uid);

  const response = await fetch(
    "https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=100",
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw new Error(
      `Slack API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    channels?: Array<{ id: string; name: string; is_private: boolean }>;
  };

  if (!data.ok || !data.channels) {
    throw new Error(`Slack API error: ${data.error ?? "Unknown error"}`);
  }

  return data.channels.map((c) => ({
    id: c.id,
    name: c.name,
    is_private: Boolean(c.is_private),
  }));
}

export async function readSlackMessagesForUser(
  uid: string,
  channelId: string,
  limit = 20,
): Promise<SlackMessage[]> {
  const token = await getSlackTokenForUser(uid);
  // conversations.history is used here — search.messages requires a paid workspace
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  const url = new URL("https://slack.com/api/conversations.history");
  url.searchParams.set("channel", channelId);
  url.searchParams.set("limit", safeLimit.toString());

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Slack API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    messages?: Array<{
      ts: string;
      user?: string;
      text?: string;
      files?: Array<{ id: string; name?: string; title?: string }>;
    }>;
  };

  if (!data.ok || !data.messages) {
    throw new Error(`Slack API error: ${data.error ?? "Unknown error"}`);
  }

  return data.messages.map((m) => ({
    ts: m.ts,
    user: m.user,
    text: m.text,
    files: m.files?.map((f) => ({ id: f.id, name: f.name, title: f.title })),
  }));
}
