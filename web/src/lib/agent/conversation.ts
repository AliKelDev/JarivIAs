import type {
  AgentAttachedContextItem,
  AgentAttachedContextType,
  AgentConversationMessage,
} from "@/lib/agent/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

function normalizeAttachedContextType(
  value: unknown,
): AgentAttachedContextType | undefined {
  if (value === "email" || value === "calendar_event" || value === "briefing") {
    return value;
  }
  return undefined;
}

function normalizeMetaValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return normalizeText(value, 300) ?? "";
  }

  if (Array.isArray(value) || isRecord(value)) {
    try {
      const serialized = JSON.stringify(value);
      if (!serialized) {
        return "";
      }
      if (serialized.length <= 500) {
        return serialized;
      }
      return `${serialized.slice(0, 500)}...`;
    } catch {
      return "";
    }
  }

  return undefined;
}

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

export function sanitizeAttachedContextInput(
  value: unknown,
  limit = 12,
): AgentAttachedContextItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const boundedLimit = Math.min(Math.max(limit, 1), 24);

  const normalized = value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const type = normalizeAttachedContextType(item.type);
      const id = normalizeText(item.id, 200);
      if (!type || !id) {
        return null;
      }

      const title = normalizeText(item.title, 220);
      const snippet = normalizeText(item.snippet, 900);

      let meta: Record<string, unknown> | undefined;
      if (isRecord(item.meta)) {
        const nextMeta: Record<string, unknown> = {};
        for (const [key, rawValue] of Object.entries(item.meta).slice(0, 20)) {
          const normalizedKey = normalizeText(key, 80);
          if (!normalizedKey) {
            continue;
          }
          const normalizedValue = normalizeMetaValue(rawValue);
          if (normalizedValue !== undefined) {
            nextMeta[normalizedKey] = normalizedValue;
          }
        }

        if (Object.keys(nextMeta).length > 0) {
          meta = nextMeta;
        }
      }

      const normalizedItem: AgentAttachedContextItem = {
        type,
        id,
      };
      if (title) {
        normalizedItem.title = title;
      }
      if (snippet) {
        normalizedItem.snippet = snippet;
      }
      if (meta) {
        normalizedItem.meta = meta;
      }

      return normalizedItem;
    })
    .filter((item): item is AgentAttachedContextItem => Boolean(item));

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.slice(0, boundedLimit);
}
