import { ApiError, GoogleGenAI } from '@google/genai';
import Groq, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from 'groq-sdk';
import type { AiConfig } from '../../config/ai.config';
import { ProviderCallError, type ProviderFailureReason } from './ai.errors';

export const GEMINI_AI_PROVIDER = 'GEMINI_AI_PROVIDER';
export const GROQ_AI_PROVIDER = 'GROQ_AI_PROVIDER';

const GROQ_STRICT_SCHEMA_MODELS = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeGroqSchemaValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeGroqSchemaValue);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'maxItems')
      .map(([key, item]) => [key, normalizeGroqSchemaValue(item)]),
  );
};

const normalizeGroqSchema = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  const normalized = normalizeGroqSchemaValue(schema);
  return isRecord(normalized) ? normalized : {};
};

const hasNullableType = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(hasNullableType);
  }
  if (!isRecord(value)) {
    return false;
  }
  if (Array.isArray(value.type) && value.type.some((type) => type === 'null')) {
    return true;
  }

  return Object.values(value).some(hasNullableType);
};

export interface StructuredAiRequest {
  schemaName: string;
  schema: Record<string, unknown>;
  systemInstruction: string;
  userContent: string;
  maxOutputTokens: number;
}

export interface AiProvider {
  generateStructured(request: StructuredAiRequest): Promise<string>;
}

const errorName = (error: unknown): string | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  typeof error.name === 'string'
    ? error.name
    : undefined;

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string'
    ? error.code.toUpperCase()
    : undefined;

const isTimeoutError = (error: unknown): boolean =>
  errorName(error) === 'AbortError' ||
  errorName(error) === 'TimeoutError' ||
  errorName(error) === 'RequestTimeoutError' ||
  errorCode(error) === 'ETIMEDOUT';

const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    if (
      message.startsWith('fetch failed') ||
      message.startsWith('failed to fetch')
    ) {
      return true;
    }
  }

  const code = errorCode(error);
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN'
  );
};

const classifyStatus = (status: number): ProviderFailureReason => {
  if (status === 408) {
    return 'timeout';
  }
  if (status === 413 || status === 429) {
    return 'rate-limit';
  }
  if (status >= 500 && status <= 599) {
    return 'server';
  }
  if (status === 400 || status === 422) {
    return 'request';
  }
  if (status >= 400 && status <= 499) {
    return 'configuration';
  }
  return 'request';
};

const classifyGeminiError = (error: unknown): ProviderFailureReason => {
  if (isTimeoutError(error)) {
    return 'timeout';
  }
  if (error instanceof ApiError) {
    return classifyStatus(error.status);
  }
  if (isNetworkError(error)) {
    return 'network';
  }
  return 'request';
};

const classifyGroqError = (error: unknown): ProviderFailureReason => {
  if (error instanceof APIConnectionTimeoutError || isTimeoutError(error)) {
    return 'timeout';
  }
  if (error instanceof APIConnectionError || isNetworkError(error)) {
    return 'network';
  }
  if (error instanceof APIError) {
    const status: unknown = error.status;
    if (typeof status === 'number') {
      return classifyStatus(status);
    }
  }
  return 'request';
};

export class GeminiAiProvider implements AiProvider {
  private readonly client: GoogleGenAI;

  constructor(private readonly config: AiConfig) {
    this.client = new GoogleGenAI({
      apiKey: config.geminiApiKey,
      httpOptions: {
        timeout: config.requestTimeoutMs,
        retryOptions: { attempts: 1 },
      },
    });
  }

  async generateStructured(request: StructuredAiRequest): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: this.config.geminiModel,
        contents: request.userContent,
        config: {
          systemInstruction: request.systemInstruction,
          temperature: 0,
          seed: 0,
          candidateCount: 1,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: request.schema,
        },
      });

      if (!response.text) {
        throw new ProviderCallError('unusable-output');
      }

      return response.text;
    } catch (error: unknown) {
      if (error instanceof ProviderCallError) {
        throw error;
      }
      throw new ProviderCallError(classifyGeminiError(error));
    }
  }
}

export class GroqAiProvider implements AiProvider {
  private readonly client: Groq;

  constructor(private readonly config: AiConfig) {
    this.client = new Groq({
      apiKey: config.groqApiKey,
      timeout: config.requestTimeoutMs,
      maxRetries: 0,
      logLevel: 'off',
    });
  }

  async generateStructured(request: StructuredAiRequest): Promise<string> {
    try {
      const supportsStrictSchema = GROQ_STRICT_SCHEMA_MODELS.has(
        this.config.groqModel,
      );
      const groqSchema = normalizeGroqSchema(request.schema);
      const useStrictSchema =
        supportsStrictSchema && !hasNullableType(groqSchema);
      const schemaInstruction = [
        request.systemInstruction,
        'Return exactly one JSON object matching this JSON Schema.',
        JSON.stringify(request.schema),
      ].join(' ');
      const response = await this.client.chat.completions.create({
        model: this.config.groqModel,
        messages: [
          {
            role: 'system',
            content: useStrictSchema
              ? request.systemInstruction
              : schemaInstruction,
          },
          { role: 'user', content: request.userContent },
        ],
        temperature: 0,
        seed: 0,
        n: 1,
        reasoning_effort: supportsStrictSchema ? 'low' : undefined,
        max_completion_tokens: request.maxOutputTokens,
        response_format: supportsStrictSchema
          ? {
              type: 'json_schema',
              json_schema: {
                name: request.schemaName,
                strict: useStrictSchema,
                schema: groqSchema,
              },
            }
          : { type: 'json_object' },
        tool_choice: 'none',
        parallel_tool_calls: false,
        citation_options: 'disabled',
        store: false,
      });

      const content = response.choices[0]?.message.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new ProviderCallError('unusable-output');
      }

      return content;
    } catch (error: unknown) {
      if (error instanceof ProviderCallError) {
        throw error;
      }
      throw new ProviderCallError(classifyGroqError(error));
    }
  }
}
