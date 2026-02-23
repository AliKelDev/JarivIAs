import {
  createModelContent,
  createUserContent,
  FunctionCallingConfigMode,
  GoogleGenAI,
  type FunctionCall,
  type FunctionDeclaration,
} from "@google/genai";
import type { AgentConversationMessage, AgentPlan } from "@/lib/agent/types";

let cachedClient: GoogleGenAI | null = null;
let cachedClientKey: string | null = null;

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  return value === "1" || value === "true" || value === "yes";
}

function readModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

function readVertexProject(): string {
  return (
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    ""
  );
}

function readVertexLocation(): string {
  return process.env.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1";
}

function buildClientConfigKey(): string {
  const useVertex = readBooleanEnv("GOOGLE_GENAI_USE_VERTEXAI", true);
  if (useVertex) {
    return `vertex:${readVertexProject()}:${readVertexLocation()}:${process.env.GEMINI_API_VERSION || "v1"}`;
  }
  return `api-key:${Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)}:${process.env.GEMINI_API_VERSION || "v1"}`;
}

function getGeminiClient(): GoogleGenAI {
  const configKey = buildClientConfigKey();
  if (cachedClient && cachedClientKey === configKey) {
    return cachedClient;
  }

  const useVertex = readBooleanEnv("GOOGLE_GENAI_USE_VERTEXAI", true);
  const apiVersion = process.env.GEMINI_API_VERSION?.trim() || "v1";

  if (useVertex) {
    const project = readVertexProject();
    const location = readVertexLocation();

    if (!project) {
      throw new Error(
        "Missing GOOGLE_CLOUD_PROJECT for Gemini Vertex AI configuration.",
      );
    }

    cachedClient = new GoogleGenAI({
      vertexai: true,
      project,
      location,
      apiVersion,
    });
    cachedClientKey = configKey;
    return cachedClient;
  }

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_API_KEY (or GEMINI_API_KEY) for Gemini API-key configuration.",
    );
  }

  cachedClient = new GoogleGenAI({ apiKey, apiVersion });
  cachedClientKey = configKey;
  return cachedClient;
}

export function getGeminiModelName(): string {
  return readModelName();
}

export async function generateGeminiText(params: {
  prompt: string;
  systemInstruction?: string;
}): Promise<string> {
  const client = getGeminiClient();
  const model = readModelName();
  const response = await client.models.generateContent({
    model,
    contents: [createUserContent(params.prompt)],
    config: {
      systemInstruction: params.systemInstruction,
      temperature: 0.2,
    },
  });
  return response.text ?? "";
}

export async function generateGeminiAgentPlan(params: {
  conversation: AgentConversationMessage[];
  toolDeclarations: FunctionDeclaration[];
  systemInstruction: string;
  onTextDelta?: (delta: string) => void | Promise<void>;
  onThoughtDelta?: (delta: string) => void | Promise<void>;
}): Promise<AgentPlan> {
  const { conversation, toolDeclarations, systemInstruction, onTextDelta, onThoughtDelta } = params;
  const client = getGeminiClient();
  const model = readModelName();

  const contents = conversation
    .map((message) => {
      const text = message.text.trim();
      if (!text) {
        return null;
      }
      return message.role === "assistant"
        ? createModelContent(text)
        : createUserContent(text);
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (contents.length === 0) {
    throw new Error("Conversation is empty. Cannot run Gemini planning.");
  }

  const generationConfig = {
    systemInstruction,
    temperature: 1,
    tools: [{ functionDeclarations: toolDeclarations }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.AUTO,
      },
    },
    thinkingConfig: {
      includeThoughts: true,
    },
  };

  if (!onTextDelta) {
    const response = await client.models.generateContent({
      model,
      contents,
      config: generationConfig,
    });

    return {
      model,
      text: response.text ?? "",
      functionCalls: response.functionCalls ?? [],
      usage: response.usageMetadata
        ? {
            promptTokenCount: response.usageMetadata.promptTokenCount,
            candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
            totalTokenCount: response.usageMetadata.totalTokenCount,
          }
        : null,
    };
  }

  const stream = await client.models.generateContentStream({
    model,
    contents,
    config: generationConfig,
  });

  let text = "";
  let functionCalls: FunctionCall[] = [];
  let usage: AgentPlan["usage"] = null;

  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const partText = part.text ?? "";
      if (!partText) continue;
      if (part.thought === true) {
        if (onThoughtDelta) await onThoughtDelta(partText);
      } else {
        text += partText;
        await onTextDelta(partText);
      }
    }

    if (chunk.functionCalls?.length) {
      functionCalls = chunk.functionCalls;
    }

    if (chunk.usageMetadata) {
      usage = {
        promptTokenCount: chunk.usageMetadata.promptTokenCount,
        candidatesTokenCount: chunk.usageMetadata.candidatesTokenCount,
        totalTokenCount: chunk.usageMetadata.totalTokenCount,
      };
    }
  }

  return {
    model,
    text,
    functionCalls,
    usage,
  };
}
