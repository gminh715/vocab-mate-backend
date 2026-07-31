import { aiConfig } from './ai.config';

const variableNames = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'AI_REQUEST_TIMEOUT_MS',
  'AI_MAX_ARTICLE_CHARACTERS',
  'AI_MAX_TERMS_PER_ARTICLE',
] as const;

describe('aiConfig', () => {
  const originalValues = Object.fromEntries(
    variableNames.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    process.env.GROQ_API_KEY = 'groq-test-key';
    process.env.GROQ_MODEL = 'groq-test-model';
    process.env.AI_REQUEST_TIMEOUT_MS = '15000';
    process.env.AI_MAX_ARTICLE_CHARACTERS = '50000';
    process.env.AI_MAX_TERMS_PER_ARTICLE = '25';
  });

  afterAll(() => {
    for (const name of variableNames) {
      const value = originalValues[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('builds typed AI provider and boundary configuration', () => {
    expect(aiConfig()).toEqual({
      geminiApiKey: 'gemini-test-key',
      geminiModel: 'gemini-test-model',
      groqApiKey: 'groq-test-key',
      groqModel: 'groq-test-model',
      requestTimeoutMs: 15000,
      maxArticleCharacters: 50000,
      maxTermsPerArticle: 25,
    });
  });

  it.each([
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'GROQ_API_KEY',
    'GROQ_MODEL',
  ] as const)('rejects missing %s without exposing another value', (name) => {
    delete process.env[name];

    expect(() => aiConfig()).toThrow(`${name} is required`);
  });

  it.each([
    ['AI_REQUEST_TIMEOUT_MS', '999'],
    ['AI_MAX_ARTICLE_CHARACTERS', 'not-a-number'],
    ['AI_MAX_TERMS_PER_ARTICLE', '101'],
  ] as const)('rejects invalid %s', (name, value) => {
    process.env[name] = value;

    expect(() => aiConfig()).toThrow(`${name} must be an integer between`);
  });
});
