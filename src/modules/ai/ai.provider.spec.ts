import type { AiConfig } from '../../config/ai.config';
import { APIError } from 'groq-sdk';
import {
  GeminiAiProvider,
  GroqAiProvider,
  type StructuredAiRequest,
} from './ai.provider';

const groqCreate = jest.fn();
const mockGroqConstructor = jest.fn();
const mockGeminiGenerate = jest.fn();
const mockGeminiConstructor = jest.fn();

jest.mock('@google/genai', () => ({
  ApiError: class extends Error {},
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
  GoogleGenAI: class {
    readonly models = {
      generateContent: mockGeminiGenerate,
    };

    constructor(options: unknown) {
      mockGeminiConstructor(options);
    }
  },
}));

jest.mock('groq-sdk', () => {
  class MockGroq {
    readonly chat = {
      completions: {
        create: groqCreate,
      },
    };

    constructor(options: unknown) {
      mockGroqConstructor(options);
    }
  }

  class MockApiError extends Error {
    constructor(
      readonly status: number,
      readonly error: object,
    ) {
      super('Groq API request failed');
    }
  }

  return {
    __esModule: true,
    default: MockGroq,
    APIConnectionError: class extends Error {},
    APIConnectionTimeoutError: class extends Error {},
    APIError: MockApiError,
  };
});

const config: AiConfig = {
  geminiApiKey: 'gemini-test-key',
  geminiModel: 'gemini-test-model',
  groqApiKey: 'groq-test-key',
  groqModel: 'llama-3.3-70b-versatile',
  requestTimeoutMs: 5000,
  maxArticleCharacters: 50000,
  maxTermsPerArticle: 25,
};

const request: StructuredAiRequest = {
  schemaName: 'health_probe',
  schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
    },
    required: ['ok'],
    additionalProperties: false,
  },
  systemInstruction: 'Return only the requested structured result.',
  userContent: JSON.stringify({ task: 'Return ok as true.' }),
  maxOutputTokens: 128,
};

describe('GroqAiProvider', () => {
  beforeEach(() => {
    groqCreate.mockReset();
    mockGroqConstructor.mockReset();
  });

  it('uses JSON Object Mode and supplies the schema in the bounded instruction', async () => {
    groqCreate.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
    });
    const provider = new GroqAiProvider(config);

    await expect(provider.generateStructured(request)).resolves.toBe(
      '{"ok":true}',
    );

    expect(groqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: config.groqModel,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              request.systemInstruction,
              'Return exactly one JSON object matching this JSON Schema.',
              JSON.stringify(request.schema),
            ].join(' '),
          },
          { role: 'user', content: request.userContent },
        ],
      }),
    );
    expect(mockGroqConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: config.requestTimeoutMs,
        maxRetries: 1,
        logLevel: 'off',
      }),
    );
  });

  it('uses strict Structured Outputs for a supported Groq model', async () => {
    groqCreate.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
    });
    const strictConfig = {
      ...config,
      groqModel: 'openai/gpt-oss-20b',
    };
    const provider = new GroqAiProvider(strictConfig);

    await expect(provider.generateStructured(request)).resolves.toBe(
      '{"ok":true}',
    );

    expect(groqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: strictConfig.groqModel,
        reasoning_effort: 'low',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: request.userContent },
        ],
      }),
    );
  });

  it('keeps nullable fields in strict schema mode and removes unsupported local bounds', async () => {
    groqCreate.mockResolvedValue({
      choices: [{ message: { content: '{"value":null,"items":[]}' } }],
    });
    const nullableRequest: StructuredAiRequest = {
      ...request,
      schema: {
        type: 'object',
        properties: {
          value: { type: ['string', 'null'] },
          items: {
            type: 'array',
            maxItems: 2,
            items: { type: 'string' },
          },
        },
        required: ['value', 'items'],
        additionalProperties: false,
      },
    };
    const provider = new GroqAiProvider({
      ...config,
      groqModel: 'openai/gpt-oss-20b',
    });

    await provider.generateStructured(nullableRequest);

    expect(groqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: nullableRequest.schemaName,
            strict: true,
            schema: {
              type: 'object',
              properties: {
                value: { type: ['string', 'null'] },
                items: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['value', 'items'],
              additionalProperties: false,
            },
          },
        },
      }),
    );
    expect(nullableRequest.schema).toEqual({
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        items: {
          type: 'array',
          maxItems: 2,
          items: { type: 'string' },
        },
      },
      required: ['value', 'items'],
      additionalProperties: false,
    });
  });

  it('retries one malformed provider JSON response before returning the strict result', async () => {
    groqCreate
      .mockRejectedValueOnce(
        new APIError(
          400,
          { code: 'json_validate_failed' },
          'invalid JSON',
          new Headers(),
        ),
      )
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
      });
    const provider = new GroqAiProvider({
      ...config,
      groqModel: 'openai/gpt-oss-20b',
    });

    await expect(provider.generateStructured(request)).resolves.toBe(
      '{"ok":true}',
    );
    expect(groqCreate).toHaveBeenCalledTimes(2);
  });
});

describe('GeminiAiProvider', () => {
  beforeEach(() => {
    mockGeminiGenerate.mockReset();
    mockGeminiConstructor.mockReset();
  });

  it('uses the stable low-latency model settings and bounded transient retries', async () => {
    mockGeminiGenerate.mockResolvedValue({ text: '{"ok":true}' });
    const provider = new GeminiAiProvider({
      ...config,
      geminiModel: 'gemini-3.5-flash-lite',
      requestTimeoutMs: 30000,
    });

    await expect(provider.generateStructured(request)).resolves.toBe(
      '{"ok":true}',
    );

    expect(mockGeminiConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOptions: {
          timeout: 30000,
          retryOptions: expect.objectContaining({
            attempts: 2,
            httpStatusCodes: [408, 429, 500, 502, 503, 504],
          }),
        },
      }),
    );
    expect(mockGeminiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.5-flash-lite',
        config: expect.objectContaining({
          thinkingConfig: { thinkingLevel: 'MINIMAL' },
          responseMimeType: 'application/json',
          responseJsonSchema: request.schema,
        }),
      }),
    );
    expect(mockGeminiGenerate.mock.calls[0][0].config).not.toHaveProperty(
      'temperature',
    );
    expect(mockGeminiGenerate.mock.calls[0][0].config).not.toHaveProperty(
      'topP',
    );
    expect(mockGeminiGenerate.mock.calls[0][0].config).not.toHaveProperty(
      'topK',
    );
  });
});
