import { generateGeminiText } from "@/lib/agent/gemini-client";
import { addMemoryEntry } from "./entries";

const EXTRACTION_SYSTEM_PROMPT = `
You are a memory extraction assistant. Given one exchange between a user and an AI assistant, identify facts, preferences, or decisions the USER revealed about themselves or their work style.

Rules:
- Only extract things about the user themselves (not generic world facts)
- Each entry must be a complete sentence, 10–80 words
- Only extract items with real signal — skip obvious, vague, or inferred items
- Return a JSON array of strings, nothing else
- Return an empty array [] if there is nothing worth remembering
- Maximum 4 entries per exchange
`.trim();

export async function extractAndSaveMemory(params: {
  uid: string;
  prompt: string;
  assistantText: string;
  threadId?: string;
}): Promise<void> {
  const { uid, prompt, assistantText, threadId } = params;

  const trimmedPrompt = prompt.trim().slice(0, 800);
  const trimmedResponse = assistantText.trim().slice(0, 1200);

  if (trimmedPrompt.length < 12) {
    return;
  }

  try {
    const exchangeText = [
      `User: ${trimmedPrompt}`,
      `Assistant: ${trimmedResponse}`,
    ].join("\n\n");

    const rawResult = await generateGeminiText({
      prompt: exchangeText,
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
    });

    const trimmed = rawResult.trim();
    const jsonStart = trimmed.indexOf("[");
    const jsonEnd = trimmed.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) {
      return;
    }

    const parsed: unknown = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) {
      return;
    }

    const entries = parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 4);

    if (entries.length === 0) {
      return;
    }

    await Promise.all(
      entries.map((content) =>
        addMemoryEntry(uid, {
          source: "conversation",
          threadId,
          content: content.trim(),
          confidence: "medium",
        }),
      ),
    );
  } catch {
    // Fail silently — memory extraction never blocks or surfaces errors to the user.
  }
}
