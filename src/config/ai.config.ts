export interface AiConfig {
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  requestTimeoutMs: number;
  reviewAgentEnabled: boolean;
  reviewMaxCallsPerSession: number;
  reviewMaxDiagnosisCalls: number;
  reviewMinConfidence: number;
  reviewPromptVersion: string;
  reviewQuestionWarmLimit: number;
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

const boundedPromptVersion = (
  name: string,
  fallback: string,
  maximumLength: number,
): string => {
  const value = process.env[name]?.trim() || fallback;
  if (
    value.length > maximumLength ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    throw new Error(
      `${name} must be ${maximumLength} characters or fewer and use only letters, numbers, dots, underscores, or hyphens`,
    );
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
  reviewPromptVersion: boundedPromptVersion(
    'AI_REVIEW_PROMPT_VERSION',
    'review-agent-v1',
    50,
  ),
  reviewQuestionWarmLimit: boundedPositiveInteger(
    'AI_REVIEW_QUESTION_WARM_LIMIT',
    1,
    5,
  ),
});
