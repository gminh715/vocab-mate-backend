export interface AiConfig {
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  requestTimeoutMs: number;
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
});
