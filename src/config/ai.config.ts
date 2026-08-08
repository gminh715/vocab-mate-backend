export interface AiConfig {
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  requestTimeoutMs: number;
  maxArticleCharacters: number;
  maxTermsPerArticle: number;
  reviewAgentEnabled: boolean;
  reviewMaxCallsPerSession: number;
  reviewMaxDiagnosisCalls: number;
  reviewMinConfidence: number;
  reviewDefaultDurationMinutes: 5 | 10 | 15;
}

const requiredValue = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const boundedPositiveInteger = (
  name: string,
  minimum: number,
  maximum: number,
): number => {
  const rawValue = process.env[name]?.trim();
  const value = Number(rawValue);

  if (
    !rawValue ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return value;
};

const booleanValue = (name: string): boolean => {
  const rawValue = process.env[name]?.trim().toLowerCase();
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be true or false`);
};

const boundedNumber = (
  name: string,
  minimum: number,
  maximum: number,
): number => {
  const rawValue = process.env[name]?.trim();
  const value = Number(rawValue);
  if (
    !rawValue ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be a number between ${minimum} and ${maximum}`,
    );
  }
  return value;
};

const reviewDuration = (name: string): 5 | 10 | 15 => {
  const value = boundedPositiveInteger(name, 5, 15);
  if (value !== 5 && value !== 10 && value !== 15) {
    throw new Error(`${name} must be one of 5, 10, or 15`);
  }
  return value;
};

export const aiConfig = (): AiConfig => ({
  geminiApiKey: requiredValue('GEMINI_API_KEY'),
  geminiModel: requiredValue('GEMINI_MODEL'),
  groqApiKey: requiredValue('GROQ_API_KEY'),
  groqModel: requiredValue('GROQ_MODEL'),
  requestTimeoutMs: boundedPositiveInteger(
    'AI_REQUEST_TIMEOUT_MS',
    1000,
    120000,
  ),
  maxArticleCharacters: boundedPositiveInteger(
    'AI_MAX_ARTICLE_CHARACTERS',
    1000,
    200000,
  ),
  maxTermsPerArticle: boundedPositiveInteger(
    'AI_MAX_TERMS_PER_ARTICLE',
    1,
    100,
  ),
  reviewAgentEnabled: booleanValue('AI_REVIEW_AGENT_ENABLED'),
  reviewMaxCallsPerSession: boundedPositiveInteger(
    'AI_REVIEW_MAX_CALLS_PER_SESSION',
    1,
    20,
  ),
  reviewMaxDiagnosisCalls: boundedPositiveInteger(
    'AI_REVIEW_MAX_DIAGNOSIS_CALLS',
    1,
    20,
  ),
  reviewMinConfidence: boundedNumber('AI_REVIEW_MIN_CONFIDENCE', 0, 1),
  reviewDefaultDurationMinutes: reviewDuration(
    'AI_REVIEW_DEFAULT_DURATION_MINUTES',
  ),
});
