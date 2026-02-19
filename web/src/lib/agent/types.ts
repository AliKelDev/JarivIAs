import type { FunctionCall, FunctionDeclaration } from "@google/genai";

export type AgentRunStatus =
  | "queued"
  | "planning"
  | "awaiting_confirmation"
  | "executing"
  | "completed"
  | "failed";

export type AgentActionStatus =
  | "planned"
  | "awaiting_confirmation"
  | "executing"
  | "completed"
  | "failed"
  | "rejected";

export type AgentApprovalDecision =
  | "reject"
  | "approve_once"
  | "approve_and_always_allow_recipient";

export type AgentToolArgs = Record<string, unknown>;
export type AgentToolResult = Record<string, unknown>;

export type AgentAttachedContextType = "email" | "calendar_event";

export type AgentAttachedContextItem = {
  type: AgentAttachedContextType;
  id: string;
  title?: string;
  snippet?: string;
  meta?: Record<string, unknown>;
};

export type AgentToolContext = {
  uid: string;
  userEmail: string | null;
  origin: string;
  runId: string;
  actionId: string;
  threadId: string;
};

export type AgentToolValidationResult =
  | { ok: true; value: AgentToolArgs }
  | { ok: false; error: string };

export type AgentToolDefinition = {
  name: string;
  description: string;
  sideEffect: boolean;
  defaultApproval: "required" | "not_required";
  parametersJsonSchema: Record<string, unknown>;
  declaration: FunctionDeclaration;
  validateArgs: (args: AgentToolArgs) => AgentToolValidationResult;
  previewForApproval: (args: AgentToolArgs) => string;
  execute: (ctx: AgentToolContext, args: AgentToolArgs) => Promise<AgentToolResult>;
};

export type AgentPolicyDecision =
  | { mode: "allow"; reason: string }
  | { mode: "require_approval"; reason: string }
  | { mode: "deny"; reason: string };

export type AgentPlan = {
  model: string;
  text: string;
  functionCalls: FunctionCall[];
  usage: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
};

export type AgentRunRequest = {
  uid: string;
  userEmail: string | null;
  prompt: string;
  threadId: string;
  origin: string;
  source: string;
  conversation?: AgentConversationMessage[];
  attachedContext?: AgentAttachedContextItem[];
  onTextDelta?: (delta: string) => void | Promise<void>;
};

export type AgentRunResponse = {
  ok: true;
  runId: string;
  actionId: string;
  threadId: string;
  status: AgentRunStatus;
  summary: string;
  mode: "assistant_text" | "tool_executed" | "requires_approval";
  model: string;
  tool?: string;
  toolArgs?: AgentToolArgs;
  approval?: {
    id: string;
    tool: string;
    reason: string;
    preview: string;
  };
  output?: AgentToolResult;
};

export type AgentToolPlanResult = {
  model: string;
  text: string;
  selectedFunctionCall: FunctionCall | null;
};

export type AgentToolSet = {
  declarations: FunctionDeclaration[];
  byName: Map<string, AgentToolDefinition>;
};

export type AgentConversationMessage = {
  role: "user" | "assistant";
  text: string;
};
