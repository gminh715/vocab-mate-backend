import type { AiConfig } from '../../config/ai.config';
import { GroqAiProvider, type StructuredAiRequest } from './ai.provider';

const groqCreate = jest.fn();

jest.mock('groq-sdk', () => {
  class MockGroq {
    readonly chat = {
      completions: {
        create: groqCreate,
      },
    };
  }

  return {
    __esModule: true,
    default: MockGroq,
    APIConnectionError: class extends Error {},
    APIConnectionTimeoutError: class extends Error {},
    APIError: class extends Error {},
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

  it('uses best-effort schema mode for nullable output and keeps local bounds out of the provider schema', async () => {
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
            strict: false,
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
});
