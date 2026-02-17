import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type FunctionDeclaration,
} from "@google/genai";
import type { AgentPlan } from "@/lib/agent/types";

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

export async function generateGeminiAgentPlan(params: {
  prompt: string;
  toolDeclarations: FunctionDeclaration[];
  systemInstruction: string;
}): Promise<AgentPlan> {
  const { prompt, toolDeclarations, systemInstruction } = params;
  const client = getGeminiClient();
  const model = readModelName();

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.2,
      tools: [{ functionDeclarations: toolDeclarations }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
          allowedFunctionNames: toolDeclarations
            .map((tool) => tool.name)
            .filter((name): name is string => Boolean(name)),
        },
      },
    },
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
