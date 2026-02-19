import type { AgentConversationMessage } from "@/lib/agent/types";

export function sanitizeConversationInput(
  value: unknown,
  limit = 40,
): AgentConversationMessage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const boundedLimit = Math.min(Math.max(limit, 1), 120);
  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role = (item as { role?: unknown }).role;
      const text = (item as { text?: unknown }).text;
      if (role !== "user" && role !== "assistant") {
        return null;
      }
      if (typeof text !== "string") {
        return null;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return null;
      }

      return {
        role,
        text: trimmed,
      } satisfies AgentConversationMessage;
    })
    .filter((item): item is AgentConversationMessage => Boolean(item));

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.slice(-boundedLimit);
}
