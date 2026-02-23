export type DashboardClientProps = {
  user: {
    uid: string;
    email?: string | null;
    name?: string | null;
  };
};

export type RunResponse = {
  ok: boolean;
  runId: string;
  actionId: string;
  threadId: string;
  status: string;
  summary: string;
  mode?: string;
  model?: string;
  tool?: string;
  toolArgs?: Record<string, unknown>;
  approval?: {
    id: string;
    tool: string;
    reason: string;
    preview: string;
  };
  output?: Record<string, unknown>;
};

export type GoogleIntegrationStatus = {
  connected: boolean;
  accountEmail?: string | null;
  scopes?: string[];
  updatedAt?: string | null;
};

export type ToolResult = Record<string, unknown> | null;

export type GmailPendingApproval = {
  id: string;
  to: string;
  subject: string;
  bodyPreview: string;
};

export type AgentPendingApproval = {
  id: string;
  tool: string;
  reason: string;
  preview: string;
  threadId?: string;
  runId?: string;
  actionId?: string;
};

export type AgentPendingApprovalsResponse = {
  ok: boolean;
  pending: Array<{
    id: string;
    tool: string;
    reason: string;
    preview: string;
    threadId: string;
    runId: string;
    actionId: string;
  }>;
};

export type AgentThreadMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt?: string | null;
  runId?: string | null;
  actionId?: string | null;
};

export type AgentThreadResponse = {
  ok: boolean;
  threadId: string;
  messages: AgentThreadMessage[];
  pendingApprovals: Array<{
    id: string;
    tool: string;
    reason: string;
    preview: string;
    runId: string;
    actionId: string;
    createdAt?: string | null;
  }>;
};

export type AgentRunStreamEvent =
  | { type: "status"; status: string; threadId: string }
  | { type: "delta"; delta: string }
  | { type: "thought_delta"; delta: string }
  | { type: "tool_call"; toolName: string; preview: string }
  | { type: "result"; result: RunResponse }
  | { type: "error"; error: string };

export type AgentConversationPayloadMessage = {
  role: "user" | "assistant";
  text: string;
};

export type UpcomingCalendarDigestItem = {
  id: string | null;
  summary: string;
  description: string | null;
  startIso: string | null;
  endIso: string | null;
  htmlLink: string | null;
  location: string | null;
};

export type RecentInboxDigestItem = {
  id: string;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  internalDateIso: string | null;
};

export type CalendarUpcomingResponse = {
  ok: boolean;
  events: UpcomingCalendarDigestItem[];
};

export type GmailRecentResponse = {
  ok: boolean;
  messages: RecentInboxDigestItem[];
};

export type RecentGmailDraftItem = {
  id: string;
  messageId: string | null;
  threadId: string | null;
  to: string;
  subject: string;
  snippet: string;
  updatedAtIso: string | null;
};

export type GmailDraftsResponse = {
  ok: boolean;
  drafts: RecentGmailDraftItem[];
};

export type BriefingPrepareResponse = {
  ok: boolean;
  cached: boolean;
  summary: string;
  dateKey: string;
  timezone: string;
  source: string;
  generatedAtIso: string | null;
  metadata?: {
    eventCount?: number;
    messageCount?: number;
  };
};

export type SlackSettingsResponse = {
  ok: boolean;
  hasToken: boolean;
};

export type AgentTrustLevel = "supervised" | "delegated" | "autonomous";

export type AttachedContextItem = {
  type: "email" | "calendar_event" | "briefing";
  id: string;
  title?: string;
  snippet?: string;
  meta?: Record<string, unknown>;
};

export type ActivityRun = {
  id: string;
  status: string;
  summary: string | null;
  prompt: string | null;
  tool: string | null;
  model: string | null;
  threadId: string | null;
  createdAt: string | null;
};

export type MemoryEntry = {
  id: string;
  source: string;
  content: string;
  confidence: "high" | "medium";
  threadId?: string;
  tags?: string[];
};

export type ThreadSummary = {
  id: string;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  lastMessageRole: "user" | "assistant" | null;
  lastMessageTextPreview: string;
};

export type AgentTrustLevelResponse = {
  ok: boolean;
  trustLevel: AgentTrustLevel;
  source?: string;
};
