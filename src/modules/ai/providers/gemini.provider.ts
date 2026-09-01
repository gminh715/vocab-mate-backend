import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { AiConfig } from '../../../config/ai.config';
import { ProviderCallError, type ProviderFailureReason } from '../ai.errors';
import type {
  AiProvider,
  StructuredAiRequest,
  StructuredAiResponse,
} from './ai-provider.contract';

const GEMINI_MINIMAL_THINKING_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash',
];

const GEMINI_DISABLED_THINKING_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const geminiThinkingConfig = (
  model: string,
):
  { thinkingLevel: ThinkingLevel } | { thinkingBudget: number } | undefined => {
  if (
    GEMINI_MINIMAL_THINKING_MODELS.some((supportedModel) =>
      model.startsWith(supportedModel),
    )
  ) {
    return { thinkingLevel: ThinkingLevel.MINIMAL };
  }
  if (
    GEMINI_DISABLED_THINKING_MODELS.some((supportedModel) =>
      model.startsWith(supportedModel),
    )
  ) {
    return { thinkingBudget: 0 };
  }

  return undefined;
};

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
  if (status === 408) return 'timeout';
  if (status === 413 || status === 429) return 'rate-limit';
  if (status >= 500 && status <= 599) return 'server';
  if (status === 400 || status === 422) return 'request';
  if (status >= 400 && status <= 499) return 'configuration';
  return 'request';
};

const classifyGeminiError = (error: unknown): ProviderFailureReason => {
  if (isTimeoutError(error)) return 'timeout';
  if (error instanceof ApiError) return classifyStatus(error.status);
  if (isNetworkError(error)) return 'network';
  return 'request';
};

export class GeminiAiProvider implements AiProvider {
  private readonly client: GoogleGenAI;

  constructor(private readonly config: AiConfig) {
    this.client = new GoogleGenAI({
      apiKey: config.geminiApiKey,
      httpOptions: {
        timeout: config.requestTimeoutMs,
        retryOptions: {
          attempts: 2,
          initialDelay: 0.25,
          maxDelay: 0.5,
          expBase: 2,
          jitter: 0.1,
          httpStatusCodes: [408, 429, 500, 502, 503, 504],
        },
      },
    });
  }

  async generateStructured(
    request: StructuredAiRequest,
  ): Promise<StructuredAiResponse> {
    try {
      const response = await this.client.models.generateContent({
        model: this.config.geminiModel,
        contents: request.userContent,
        config: {
          systemInstruction: request.systemInstruction,
          candidateCount: 1,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: request.schema,
          thinkingConfig: geminiThinkingConfig(this.config.geminiModel),
        },
      });
      if (!response.text) throw new ProviderCallError('unusable-output');

      return {
        content: response.text,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? null,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
        },
      };
    } catch (error: unknown) {
      if (error instanceof ProviderCallError) throw error;
      throw new ProviderCallError(classifyGeminiError(error));
    }
  }
}
