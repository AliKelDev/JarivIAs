import {
  createCalendarEventForUser,
  isIsoDate,
} from "@/lib/tools/calendar";
import {
  isValidEmailAddress,
  normalizeEmailAddress,
  sendGmailMessageForUser,
} from "@/lib/tools/gmail";
import type {
  AgentToolArgs,
  AgentToolDefinition,
  AgentToolSet,
  AgentToolValidationResult,
} from "@/lib/agent/types";

function readRequiredStringArg(
  args: AgentToolArgs,
  field: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = args[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: `${field} is required and must be a string.` };
  }
  return { ok: true, value: value.trim() };
}

const gmailSendParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    to: {
      type: "string",
      description: "Recipient email address.",
    },
    subject: {
      type: "string",
      description: "Email subject line.",
    },
    bodyText: {
      type: "string",
      description: "Plain text body for the email.",
    },
  },
  required: ["to", "subject", "bodyText"],
};

const calendarCreateParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description: "Calendar event title.",
    },
    description: {
      type: "string",
      description: "Optional calendar event description.",
    },
    location: {
      type: "string",
      description: "Optional event location.",
    },
    startIso: {
      type: "string",
      description: "Event start in ISO-8601 format.",
    },
    endIso: {
      type: "string",
      description: "Event end in ISO-8601 format.",
    },
    timeZone: {
      type: "string",
      description: "IANA time zone name, e.g. America/New_York.",
    },
  },
  required: ["summary", "startIso", "endIso"],
};

const gmailSendTool: AgentToolDefinition = {
  name: "gmail_send",
  description: "Send a Gmail message from the connected Google account.",
  sideEffect: true,
  defaultApproval: "required",
  parametersJsonSchema: gmailSendParametersJsonSchema,
  declaration: {
    name: "gmail_send",
    description: "Send an email through Gmail for the connected user account.",
    parametersJsonSchema: gmailSendParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const toResult = readRequiredStringArg(args, "to");
    if (!toResult.ok) {
      return toResult;
    }
    const subjectResult = readRequiredStringArg(args, "subject");
    if (!subjectResult.ok) {
      return subjectResult;
    }
    const bodyResult = readRequiredStringArg(args, "bodyText");
    if (!bodyResult.ok) {
      return bodyResult;
    }

    const to = normalizeEmailAddress(toResult.value);
    if (!isValidEmailAddress(to)) {
      return { ok: false, error: "to must be a valid email address." };
    }

    return {
      ok: true,
      value: {
        to,
        subject: subjectResult.value,
        bodyText: bodyResult.value,
      },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const to = typeof args.to === "string" ? args.to : "(missing)";
    const subject = typeof args.subject === "string" ? args.subject : "(missing)";
    return `Send email to ${to} with subject "${subject}".`;
  },
  async execute(ctx, args) {
    const to = args.to as string;
    const subject = args.subject as string;
    const bodyText = args.bodyText as string;
    const sendResult = await sendGmailMessageForUser({
      uid: ctx.uid,
      origin: ctx.origin,
      to,
      subject,
      bodyText,
      auditType: "gmail_send_agent",
      auditMeta: {
        source: "agent_runtime",
        runId: ctx.runId,
        actionId: ctx.actionId,
      },
    });

    return {
      messageId: sendResult.messageId,
      threadId: sendResult.threadId,
      to,
      subject,
    };
  },
};

const calendarCreateTool: AgentToolDefinition = {
  name: "calendar_event_create",
  description: "Create a Calendar event on the connected Google account.",
  sideEffect: true,
  defaultApproval: "required",
  parametersJsonSchema: calendarCreateParametersJsonSchema,
  declaration: {
    name: "calendar_event_create",
    description:
      "Create a Google Calendar event for the connected user with start and end times.",
    parametersJsonSchema: calendarCreateParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const summaryResult = readRequiredStringArg(args, "summary");
    if (!summaryResult.ok) {
      return summaryResult;
    }
    const startResult = readRequiredStringArg(args, "startIso");
    if (!startResult.ok) {
      return startResult;
    }
    const endResult = readRequiredStringArg(args, "endIso");
    if (!endResult.ok) {
      return endResult;
    }

    if (!isIsoDate(startResult.value) || !isIsoDate(endResult.value)) {
      return {
        ok: false,
        error: "startIso and endIso must be valid ISO datetime strings.",
      };
    }

    const description =
      typeof args.description === "string" ? args.description.trim() : undefined;
    const location =
      typeof args.location === "string" ? args.location.trim() : undefined;
    const timeZone =
      typeof args.timeZone === "string" && args.timeZone.trim()
        ? args.timeZone.trim()
        : "UTC";

    return {
      ok: true,
      value: {
        summary: summaryResult.value,
        description,
        location,
        startIso: startResult.value,
        endIso: endResult.value,
        timeZone,
      },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const summary =
      typeof args.summary === "string" ? args.summary : "(missing summary)";
    const startIso =
      typeof args.startIso === "string" ? args.startIso : "(missing start)";
    const endIso = typeof args.endIso === "string" ? args.endIso : "(missing end)";
    return `Create event "${summary}" from ${startIso} to ${endIso}.`;
  },
  async execute(ctx, args) {
    const createResult = await createCalendarEventForUser({
      uid: ctx.uid,
      origin: ctx.origin,
      summary: args.summary as string,
      description:
        typeof args.description === "string" ? args.description : undefined,
      location: typeof args.location === "string" ? args.location : undefined,
      startIso: args.startIso as string,
      endIso: args.endIso as string,
      timeZone: typeof args.timeZone === "string" ? args.timeZone : "UTC",
      auditType: "calendar_event_create_agent",
      auditMeta: {
        source: "agent_runtime",
        runId: ctx.runId,
        actionId: ctx.actionId,
      },
    });

    return {
      eventId: createResult.eventId,
      eventLink: createResult.eventLink,
      summary: args.summary,
    };
  },
};

const agentTools: AgentToolDefinition[] = [gmailSendTool, calendarCreateTool];

export function getAgentToolSet(): AgentToolSet {
  const byName = new Map<string, AgentToolDefinition>();
  for (const tool of agentTools) {
    byName.set(tool.name, tool);
  }
  return {
    declarations: agentTools.map((tool) => tool.declaration),
    byName,
  };
}
