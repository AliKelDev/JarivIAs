import {
  createCalendarEventForUser,
  isIsoDate,
  searchCalendarEventsForUser,
  updateCalendarEventForUser,
} from "@/lib/tools/calendar";
import {
  listSlackChannelsForUser,
  readSlackMessagesForUser,
} from "@/lib/tools/slack";
import {
  createGmailDraftForUser,
  isValidEmailAddress,
  readGmailThreadForUser,
  normalizeEmailAddress,
  replyToGmailThreadForUser,
  searchGmailMessagesForUser,
  sendGmailMessageForUser,
} from "@/lib/tools/gmail";
import { addMemoryEntry, searchMemoryEntries } from "@/lib/memory";
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
    attendees: {
      type: "array",
      items: { type: "string" },
      description: "Optional list of guest email addresses to invite.",
    },
  },
  required: ["summary", "startIso", "endIso"],
};

const gmailDraftCreateParametersJsonSchema: Record<string, unknown> = {
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
      description: "Plain text body for the draft email.",
    },
  },
  required: ["to", "subject", "bodyText"],
};

const gmailThreadReadParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    threadId: {
      type: "string",
      description: "Gmail thread ID to read.",
    },
    maxMessages: {
      type: "integer",
      description: "Maximum messages to return from the thread (1-10).",
    },
  },
  required: ["threadId"],
};

const gmailDraftCreateTool: AgentToolDefinition = {
  name: "gmail_draft_create",
  description:
    "Create a draft email in the user's Gmail inbox without sending it. " +
    "Use this when the user wants a message composed for review, when intent to send is unclear, " +
    "or when acting proactively without explicit send instruction.",
  sideEffect: false,
  defaultApproval: "not_required",
  parametersJsonSchema: gmailDraftCreateParametersJsonSchema,
  declaration: {
    name: "gmail_draft_create",
    description:
      "Create a draft email in Gmail. The draft is saved to the user's inbox but not sent. " +
      "Prefer this over gmail_send when the user hasn't explicitly asked to send.",
    parametersJsonSchema: gmailDraftCreateParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const toResult = readRequiredStringArg(args, "to");
    if (!toResult.ok) return toResult;
    const subjectResult = readRequiredStringArg(args, "subject");
    if (!subjectResult.ok) return subjectResult;
    const bodyResult = readRequiredStringArg(args, "bodyText");
    if (!bodyResult.ok) return bodyResult;

    const to = normalizeEmailAddress(toResult.value);
    if (!isValidEmailAddress(to)) {
      return { ok: false, error: "to must be a valid email address." };
    }

    return {
      ok: true,
      value: { to, subject: subjectResult.value, bodyText: bodyResult.value },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const to = typeof args.to === "string" ? args.to : "(missing)";
    const subject = typeof args.subject === "string" ? args.subject : "(missing)";
    return `Create draft to ${to} with subject "${subject}".`;
  },
  async execute(ctx, args) {
    const result = await createGmailDraftForUser({
      uid: ctx.uid,
      origin: ctx.origin,
      to: args.to as string,
      subject: args.subject as string,
      bodyText: args.bodyText as string,
    });
    return {
      draftId: result.draftId,
      gmailLink: result.gmailLink,
      to: args.to,
      subject: args.subject,
    };
  },
};

const gmailThreadReadTool: AgentToolDefinition = {
  name: "gmail_thread_read",
  description:
    "Read a Gmail thread with full message content for context and follow-up drafting.",
  sideEffect: false,
  defaultApproval: "not_required",
  parametersJsonSchema: gmailThreadReadParametersJsonSchema,
  declaration: {
    name: "gmail_thread_read",
    description:
      "Read a Gmail thread by thread ID and return up to 10 recent messages with body text.",
    parametersJsonSchema: gmailThreadReadParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const threadIdResult = readRequiredStringArg(args, "threadId");
    if (!threadIdResult.ok) {
      return threadIdResult;
    }

    let maxMessages = 5;
    const rawMax = args.maxMessages;
    if (rawMax !== undefined) {
      if (
        typeof rawMax !== "number" ||
        !Number.isFinite(rawMax) ||
        !Number.isInteger(rawMax)
      ) {
        return { ok: false, error: "maxMessages must be an integer between 1 and 10." };
      }
      maxMessages = Math.min(Math.max(rawMax, 1), 10);
    }

    return {
      ok: true,
      value: {
        threadId: threadIdResult.value,
        maxMessages,
      },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const threadId = typeof args.threadId === "string" ? args.threadId : "(missing)";
    const maxMessages =
      typeof args.maxMessages === "number" ? args.maxMessages : 5;
    return `Read Gmail thread ${threadId} (up to ${maxMessages} messages).`;
  },
  async execute(ctx, args) {
    const result = await readGmailThreadForUser({
      uid: ctx.uid,
      origin: ctx.origin,
      threadId: args.threadId as string,
      maxMessages:
        typeof args.maxMessages === "number" ? args.maxMessages : undefined,
    });

    return {
      threadId: result.threadId,
      historyId: result.historyId,
      messages: result.messages,
    };
  },
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

    const attendees = Array.isArray(args.attendees)
      ? (args.attendees as unknown[]).filter((e): e is string => typeof e === "string")
      : undefined;

    return {
      ok: true,
      value: {
        summary: summaryResult.value,
        description,
        location,
        startIso: startResult.value,
        endIso: endResult.value,
        timeZone,
        attendees,
      },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const summary =
      typeof args.summary === "string" ? args.summary : "(missing summary)";
    const startIso =
      typeof args.startIso === "string" ? args.startIso : "(missing start)";
    const endIso = typeof args.endIso === "string" ? args.endIso : "(missing end)";
    const guests = Array.isArray(args.attendees) && args.attendees.length > 0
      ? ` Guests: ${(args.attendees as string[]).join(", ")}.`
      : "";
    return `Create event "${summary}" from ${startIso} to ${endIso}.${guests}`;
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
      attendees: Array.isArray(args.attendees)
        ? (args.attendees as unknown[]).filter((e): e is string => typeof e === "string")
        : undefined,
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

const calendarUpdateParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    eventId: {
      type: "string",
      description: "The Google Calendar event ID to update.",
    },
    summary: {
      type: "string",
      description: "New event title (optional).",
    },
    description: {
      type: "string",
      description: "New event description (optional).",
    },
    location: {
      type: "string",
      description: "New event location (optional).",
    },
    startIso: {
      type: "string",
      description: "New start time in ISO-8601 format (optional).",
    },
    endIso: {
      type: "string",
      description: "New end time in ISO-8601 format (optional).",
    },
    timeZone: {
      type: "string",
      description: "IANA time zone name, e.g. America/New_York (optional).",
    },
    attendees: {
      type: "array",
      items: { type: "string" },
      description: "Optional list of guest email addresses. Replaces the existing guest list.",
    },
  },
  required: ["eventId"],
};

const calendarUpdateTool: AgentToolDefinition = {
  name: "calendar_event_update",
  description:
    "Update an existing Google Calendar event. Use this to reschedule, rename, or change details of an event the user already has.",
  sideEffect: true,
  defaultApproval: "required",
  parametersJsonSchema: calendarUpdateParametersJsonSchema,
  declaration: {
    name: "calendar_event_update",
    description:
      "Update fields of an existing Google Calendar event by event ID. Only provided fields are changed.",
    parametersJsonSchema: calendarUpdateParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const eventIdResult = readRequiredStringArg(args, "eventId");
    if (!eventIdResult.ok) return eventIdResult;

    if (typeof args.startIso === "string" && !isIsoDate(args.startIso)) {
      return { ok: false, error: "startIso must be a valid ISO datetime string." };
    }
    if (typeof args.endIso === "string" && !isIsoDate(args.endIso)) {
      return { ok: false, error: "endIso must be a valid ISO datetime string." };
    }

    return {
      ok: true,
      value: {
        eventId: eventIdResult.value,
        summary: typeof args.summary === "string" ? args.summary.trim() : undefined,
        description: typeof args.description === "string" ? args.description.trim() : undefined,
        location: typeof args.location === "string" ? args.location.trim() : undefined,
        startIso: typeof args.startIso === "string" ? args.startIso : undefined,
        endIso: typeof args.endIso === "string" ? args.endIso : undefined,
        timeZone: typeof args.timeZone === "string" && args.timeZone.trim() ? args.timeZone.trim() : "UTC",
        attendees: Array.isArray(args.attendees)
          ? (args.attendees as unknown[]).filter((e): e is string => typeof e === "string")
          : undefined,
      },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const eventId = typeof args.eventId === "string" ? args.eventId : "(missing)";
    const changes: string[] = [];
    if (args.summary) changes.push(`title → "${args.summary}"`);
    if (args.startIso) changes.push(`start → ${args.startIso}`);
    if (args.endIso) changes.push(`end → ${args.endIso}`);
    if (args.location) changes.push(`location → "${args.location}"`);
    if (Array.isArray(args.attendees) && args.attendees.length > 0)
      changes.push(`guests → ${(args.attendees as string[]).join(", ")}`);
    return `Update event ${eventId}${changes.length ? `: ${changes.join(", ")}` : "."}`;
  },
  async execute(ctx, args) {
    const result = await updateCalendarEventForUser({
      uid: ctx.uid,
      origin: ctx.origin,
      eventId: args.eventId as string,
      summary: args.summary as string | undefined,
      description: args.description as string | undefined,
      location: args.location as string | undefined,
      startIso: args.startIso as string | undefined,
      endIso: args.endIso as string | undefined,
      timeZone: args.timeZone as string | undefined,
      attendees: Array.isArray(args.attendees)
        ? (args.attendees as unknown[]).filter((e): e is string => typeof e === "string")
        : undefined,
      auditType: "calendar_event_update_agent",
      auditMeta: { source: "agent_runtime", runId: ctx.runId, actionId: ctx.actionId },
    });
    return { eventId: result.eventId, eventLink: result.eventLink };
  },
};

const searchMemoryParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    query: {
      type: "string",
      description: "Phrase to search for in saved user memory entries.",
    },
    limit: {
      type: "integer",
      description: "Maximum number of matches to return (1-20).",
    },
  },
  required: ["query"],
};

const searchMemoryTool: AgentToolDefinition = {
  name: "search_memory",
  description:
    "Search the user's saved memory entries when you need older facts or preferences that may not be in the current context block.",
  sideEffect: false,
  defaultApproval: "not_required",
  parametersJsonSchema: searchMemoryParametersJsonSchema,
  declaration: {
    name: "search_memory",
    description:
      "Search saved long-term memory entries by text query and return the best matches.",
    parametersJsonSchema: searchMemoryParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const queryResult = readRequiredStringArg(args, "query");
    if (!queryResult.ok) {
      return queryResult;
    }

    if (queryResult.value.length < 2) {
      return { ok: false, error: "query must be at least 2 characters." };
    }
    if (queryResult.value.length > 120) {
      return { ok: false, error: "query must be 120 characters or fewer." };
    }

    let limit = 5;
    if (args.limit !== undefined) {
      if (
        typeof args.limit !== "number" ||
        !Number.isFinite(args.limit) ||
        !Number.isInteger(args.limit)
      ) {
        return { ok: false, error: "limit must be an integer between 1 and 20." };
      }
      limit = Math.min(Math.max(args.limit, 1), 20);
    }

    return {
      ok: true,
      value: {
        query: queryResult.value,
        limit,
      },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const query = typeof args.query === "string" ? args.query : "(missing query)";
    const limit = typeof args.limit === "number" ? args.limit : 5;
    return `Search memory for "${query}" (top ${limit}).`;
  },
  async execute(ctx, args) {
    const query = args.query as string;
    const limit = typeof args.limit === "number" ? args.limit : 5;
    const matches = await searchMemoryEntries({
      uid: ctx.uid,
      query,
      limit,
      scanLimit: 100,
    });

    return {
      query,
      resultCount: matches.length,
      entries: matches,
    };
  },
};

const saveMemoryParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    content: {
      type: "string",
      description: "The fact, preference, or constraint to remember about the user.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium"],
      description: "How confident you are this is accurate. Use 'high' only when explicitly stated by the user.",
    },
  },
  required: ["content"],
};

const saveMemoryTool: AgentToolDefinition = {
  name: "save_memory",
  description:
    "Persist something useful about the user for future sessions — preferences, constraints, working style, important contacts, or decisions they've made. " +
    "Only save things that are not already obvious from their profile and that will genuinely help you serve them better later.",
  sideEffect: false,
  defaultApproval: "not_required",
  parametersJsonSchema: saveMemoryParametersJsonSchema,
  declaration: {
    name: "save_memory",
    description:
      "Save a fact or preference about the user to long-term memory. " +
      "Use this when you learn something that should persist across future conversations.",
    parametersJsonSchema: saveMemoryParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const contentResult = readRequiredStringArg(args, "content");
    if (!contentResult.ok) return contentResult;
    if (contentResult.value.length > 500) {
      return { ok: false, error: "content must be 500 characters or fewer." };
    }
    const confidence =
      args.confidence === "high" || args.confidence === "medium"
        ? args.confidence
        : "medium";
    return { ok: true, value: { content: contentResult.value, confidence } };
  },
  previewForApproval(args: AgentToolArgs): string {
    return `Remember: "${typeof args.content === "string" ? args.content : ""}"`;
  },
  async execute(ctx, args) {
    await addMemoryEntry(ctx.uid, {
      source: "conversation",
      threadId: ctx.threadId,
      content: args.content as string,
      confidence: args.confidence === "high" ? "high" : "medium",
    });
    return { saved: true, content: args.content };
  },
};

const calendarSearchParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    query: {
      type: "string",
      description:
        "Optional text to search for in event titles, descriptions, locations, and attendees.",
    },
    timeMin: {
      type: "string",
      description:
        "Start of the search window in ISO-8601 format. Defaults to now.",
    },
    timeMax: {
      type: "string",
      description:
        "End of the search window in ISO-8601 format. Defaults to 30 days from now.",
    },
    maxResults: {
      type: "integer",
      description: "Maximum number of events to return (1-20). Defaults to 10.",
    },
  },
};

const calendarSearchTool: AgentToolDefinition = {
  name: "calendar_search",
  description:
    "Search the user's Google Calendar for events in a given time window. " +
    "Use this when the user asks about upcoming events, availability, or meetings — " +
    "especially mid-conversation when calendar context wasn't provided upfront.",
  sideEffect: false,
  defaultApproval: "not_required",
  parametersJsonSchema: calendarSearchParametersJsonSchema,
  declaration: {
    name: "calendar_search",
    description:
      "Search Google Calendar events by optional query and time range. Returns matching events with title, time, location, and link.",
    parametersJsonSchema: calendarSearchParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    if (args.timeMin !== undefined) {
      if (typeof args.timeMin !== "string" || !isIsoDate(args.timeMin)) {
        return { ok: false, error: "timeMin must be a valid ISO datetime string." };
      }
    }
    if (args.timeMax !== undefined) {
      if (typeof args.timeMax !== "string" || !isIsoDate(args.timeMax)) {
        return { ok: false, error: "timeMax must be a valid ISO datetime string." };
      }
    }
    if (args.maxResults !== undefined) {
      if (
        typeof args.maxResults !== "number" ||
        !Number.isInteger(args.maxResults)
      ) {
        return { ok: false, error: "maxResults must be an integer between 1 and 20." };
      }
    }
    return {
      ok: true,
      value: {
        query: typeof args.query === "string" ? args.query.trim() : undefined,
        timeMin: typeof args.timeMin === "string" ? args.timeMin : undefined,
        timeMax: typeof args.timeMax === "string" ? args.timeMax : undefined,
        maxResults:
          typeof args.maxResults === "number"
            ? Math.min(Math.max(Math.floor(args.maxResults), 1), 20)
            : undefined,
      },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const q = typeof args.query === "string" && args.query ? ` "${args.query}"` : "";
    return `Search calendar${q}.`;
  },
  async execute(ctx, args) {
    const results = await searchCalendarEventsForUser({
      uid: ctx.uid,
      origin: ctx.origin,
      query: typeof args.query === "string" ? args.query : undefined,
      timeMinIso: typeof args.timeMin === "string" ? args.timeMin : undefined,
      timeMaxIso: typeof args.timeMax === "string" ? args.timeMax : undefined,
      maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
    });
    return { resultCount: results.length, events: results };
  },
};

const slackChannelsParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const slackChannelsTool: AgentToolDefinition = {
  name: "slack_channels",
  description:
    "List the user's Slack channels so you can find the right channel ID before reading messages. " +
    "Requires the user to have configured a Slack User Token in dashboard settings.",
  sideEffect: false,
  defaultApproval: "not_required",
  parametersJsonSchema: slackChannelsParametersJsonSchema,
  declaration: {
    name: "slack_channels",
    description: "List available Slack channels for the connected workspace.",
    parametersJsonSchema: slackChannelsParametersJsonSchema,
  },
  validateArgs(): AgentToolValidationResult {
    return { ok: true, value: {} };
  },
  previewForApproval(): string {
    return "List Slack channels.";
  },
  async execute(ctx) {
    const channels = await listSlackChannelsForUser(ctx.uid);
    return { channelCount: channels.length, channels };
  },
};

const slackReadParametersJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    channelId: {
      type: "string",
      description: "Slack channel ID to read messages from. Use slack_channels to find the ID.",
    },
    limit: {
      type: "integer",
      description: "Number of messages to return (1-50). Defaults to 20.",
    },
  },
  required: ["channelId"],
};

const slackReadTool: AgentToolDefinition = {
  name: "slack_read",
  description:
    "Read recent messages from a Slack channel. " +
    "Use slack_channels first to get the channel ID. " +
    "Requires the user to have configured a Slack User Token in dashboard settings.",
  sideEffect: false,
  defaultApproval: "not_required",
  parametersJsonSchema: slackReadParametersJsonSchema,
  declaration: {
    name: "slack_read",
    description: "Read recent messages from a Slack channel by channel ID.",
    parametersJsonSchema: slackReadParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const channelIdResult = readRequiredStringArg(args, "channelId");
    if (!channelIdResult.ok) return channelIdResult;

    let limit = 20;
    if (args.limit !== undefined) {
      if (
        typeof args.limit !== "number" ||
        !Number.isInteger(args.limit)
      ) {
        return { ok: false, error: "limit must be an integer between 1 and 50." };
      }
      limit = Math.min(Math.max(args.limit, 1), 50);
    }

    return { ok: true, value: { channelId: channelIdResult.value, limit } };
  },
  previewForApproval(args: AgentToolArgs): string {
    const channelId = typeof args.channelId === "string" ? args.channelId : "(missing)";
    return `Read Slack messages from channel ${channelId}.`;
  },
  async execute(ctx, args) {
    const messages = await readSlackMessagesForUser(
      ctx.uid,
      args.channelId as string,
      typeof args.limit === "number" ? args.limit : 20,
    );
    return { messageCount: messages.length, messages };
  },
};

const gmailSearchParametersJsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Gmail search query. Supports standard Gmail syntax: from:name, subject:topic, is:unread, etc.",
    },
    maxResults: {
      type: "integer",
      description: "Max messages to return (1–20, default 10).",
    },
  },
  required: ["query"],
  additionalProperties: false,
};

const gmailSearchTool: AgentToolDefinition = {
  name: "gmail_search",
  description:
    "Search Gmail messages by query to find threads and message IDs. " +
    "Use this before gmail_thread_read or gmail_reply when you don't already have a threadId.",
  sideEffect: false,
  defaultApproval: "not_required",
  parametersJsonSchema: gmailSearchParametersJsonSchema,
  declaration: {
    name: "gmail_search",
    description:
      "Search the user's Gmail inbox using a query string. Returns matching messages with threadId, sender, subject, and snippet.",
    parametersJsonSchema: gmailSearchParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const queryResult = readRequiredStringArg(args, "query");
    if (!queryResult.ok) {
      return queryResult;
    }

    let maxResults = 10;
    const rawMax = args.maxResults;
    if (rawMax !== undefined) {
      if (typeof rawMax !== "number" || !Number.isFinite(rawMax) || !Number.isInteger(rawMax)) {
        return { ok: false, error: "maxResults must be an integer between 1 and 20." };
      }
      maxResults = Math.min(Math.max(rawMax, 1), 20);
    }

    return { ok: true, value: { query: queryResult.value, maxResults } };
  },
  previewForApproval(args: AgentToolArgs): string {
    return `Search Gmail: "${typeof args.query === "string" ? args.query : ""}"`;
  },
  async execute(ctx, args) {
    const messages = await searchGmailMessagesForUser({
      uid: ctx.uid,
      origin: ctx.origin,
      query: args.query as string,
      maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
    });
    return { resultCount: messages.length, messages };
  },
};

const gmailReplyParametersJsonSchema = {
  type: "object",
  properties: {
    threadId: {
      type: "string",
      description: "The Gmail thread ID to reply to. Use gmail_thread_read first to get this.",
    },
    to: {
      type: "string",
      description: "The recipient email address (usually the original sender of the thread).",
    },
    bodyText: {
      type: "string",
      description: "The plain-text body of the reply.",
    },
  },
  required: ["threadId", "to", "bodyText"],
  additionalProperties: false,
};

const gmailReplyTool: AgentToolDefinition = {
  name: "gmail_reply",
  description:
    "Reply to an existing Gmail thread. Sends a reply that appears inline in the same thread. " +
    "Use gmail_thread_read first to get the threadId and the original sender's address.",
  sideEffect: true,
  defaultApproval: "required",
  parametersJsonSchema: gmailReplyParametersJsonSchema,
  declaration: {
    name: "gmail_reply",
    description:
      "Send a reply to an existing Gmail thread. The subject is inferred from the thread automatically.",
    parametersJsonSchema: gmailReplyParametersJsonSchema,
  },
  validateArgs(args: AgentToolArgs): AgentToolValidationResult {
    const threadIdResult = readRequiredStringArg(args, "threadId");
    if (!threadIdResult.ok) {
      return threadIdResult;
    }
    const toResult = readRequiredStringArg(args, "to");
    if (!toResult.ok) {
      return toResult;
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
        threadId: threadIdResult.value,
        to,
        bodyText: bodyResult.value,
      },
    };
  },
  previewForApproval(args: AgentToolArgs): string {
    const to = typeof args.to === "string" ? args.to : "(missing)";
    const threadId = typeof args.threadId === "string" ? args.threadId : "(missing)";
    return `Reply to thread ${threadId} → ${to}.`;
  },
  async execute(ctx, args) {
    const result = await replyToGmailThreadForUser({
      uid: ctx.uid,
      origin: ctx.origin,
      threadId: args.threadId as string,
      to: args.to as string,
      bodyText: args.bodyText as string,
    });
    return { messageId: result.messageId, threadId: result.threadId };
  },
};

const agentTools: AgentToolDefinition[] = [
  searchMemoryTool,
  saveMemoryTool,
  gmailDraftCreateTool,
  gmailSearchTool,
  gmailThreadReadTool,
  gmailSendTool,
  gmailReplyTool,
  calendarSearchTool,
  calendarCreateTool,
  calendarUpdateTool,
  slackChannelsTool,
  slackReadTool,
];

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
