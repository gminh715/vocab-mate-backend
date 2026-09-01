export const GEMINI_AI_PROVIDER = 'GEMINI_AI_PROVIDER';
export const GROQ_AI_PROVIDER = 'GROQ_AI_PROVIDER';

export interface StructuredAiRequest {
  schemaName: string;
  schema: Record<string, unknown>;
  systemInstruction: string;
  userContent: string;
  maxOutputTokens: number;
}

export interface StructuredAiResponse {
  content: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
}

export interface AiProvider {
  generateStructured(
    request: StructuredAiRequest,
  ): Promise<string | StructuredAiResponse>;
}
