import { aiConfig } from './ai.config';

const variableNames = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'AI_REQUEST_TIMEOUT_MS',
  'AI_REVIEW_AGENT_ENABLED',
  'AI_REVIEW_MAX_CALLS_PER_SESSION',
  'AI_REVIEW_MAX_DIAGNOSIS_CALLS',
  'AI_REVIEW_MIN_CONFIDENCE',
  'AI_REVIEW_PROMPT_VERSION',
  'AI_REVIEW_QUESTION_WARM_LIMIT',
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
    process.env.AI_REVIEW_AGENT_ENABLED = 'true';
    process.env.AI_REVIEW_MAX_CALLS_PER_SESSION = '6';
    process.env.AI_REVIEW_MAX_DIAGNOSIS_CALLS = '4';
    process.env.AI_REVIEW_MIN_CONFIDENCE = '0.65';
    process.env.AI_REVIEW_PROMPT_VERSION = 'review-agent-test-v2';
    process.env.AI_REVIEW_QUESTION_WARM_LIMIT = '2';
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
      reviewAgentEnabled: true,
      reviewMaxCallsPerSession: 6,
      reviewMaxDiagnosisCalls: 4,
      reviewMinConfidence: 0.65,
      reviewPromptVersion: 'review-agent-test-v2',
      reviewQuestionWarmLimit: 2,
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
    ['AI_REVIEW_MAX_CALLS_PER_SESSION', '21'],
    ['AI_REVIEW_MAX_DIAGNOSIS_CALLS', '0'],
    ['AI_REVIEW_QUESTION_WARM_LIMIT', '6'],
  ] as const)('rejects invalid %s', (name, value) => {
    process.env[name] = value;

    expect(() => aiConfig()).toThrow(`${name} must be an integer between`);
  });

  it.each([
    ['AI_REVIEW_AGENT_ENABLED', 'yes'],
    ['AI_REVIEW_MIN_CONFIDENCE', '1.1'],
  ] as const)('rejects invalid review-agent setting %s', (name, value) => {
    process.env[name] = value;

    expect(() => aiConfig()).toThrow(name);
  });

  it('uses a stable prompt version default when it is omitted', () => {
    delete process.env.AI_REVIEW_PROMPT_VERSION;

    expect(aiConfig().reviewPromptVersion).toBe('review-agent-v1');
  });

  it.each(['review agent v1', 'review-agent-v1/unsafe', 'x'.repeat(51)])(
    'rejects invalid prompt version %s',
    (value) => {
      process.env.AI_REVIEW_PROMPT_VERSION = value;

      expect(() => aiConfig()).toThrow('AI_REVIEW_PROMPT_VERSION');
    },
  );
});
