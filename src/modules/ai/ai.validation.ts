import {
  AGENTIC_REVIEW_V1_SKILL_DIMENSIONS,
  CEFR_LEVELS,
  LEXICAL_UNIT_TYPES,
  REVIEW_AGENT_ACTIONS,
  REVIEW_ERROR_TYPES,
  REVIEW_GOALS,
  REVIEW_QUESTION_BATCH_MAX_SIZE,
  REVIEW_QUESTION_PROMPT_STYLES,
  REVIEW_QUESTION_TYPES,
  REVIEW_RETEST_AFTER_ITEMS,
  REVIEW_TARGET_DURATIONS,
  type DiagnoseReviewAnswerInput,
  type PlanReviewSessionInput,
  type ReviewAnswerDiagnosisResult,
  type ReviewAttemptSnapshot,
  type ReviewQuestionBatchGenerationResult,
  type TermEnrichmentInput,
  type TermEnrichmentResult,
  type TermExample,
  type ReviewQuestionGenerationInput,
  type ReviewQuestionGenerationOption,
  type ReviewQuestionGenerationResult,
  type ReviewSessionPlanResult,
  type ReviewSkillAggregate,
} from './ai.contracts';
import { AiError, ProviderCallError } from './ai.errors';

export const AI_OUTPUT_LIMITS = {
  termText: 200,
  partOfSpeech: 100,
  enrichmentText: 2000,
  ipa: 100,
  listItems: 8,
  listItemText: 200,
  vocabularyTopic: 200,
  examples: 2,
  exampleSentence: 500,
  exampleTranslation: 1000,
  sentenceTranslation: 5000,
  reviewPrompt: 500,
  reviewAnswer: 1000,
  reviewExplanation: 600,
  reviewExplanationSentence: 220,
  reviewOptions: 4,
  reviewCandidates: 100,
  reviewAlias: 32,
  reviewRecentAttempts: 5,
  reviewSkillAggregates: 5,
  reviewPlanFocusDimensions: 3,
  reviewPlanSummary: 300,
  reviewReasonCode: 80,
  reviewLessonTitle: 80,
  reviewLessonExplanation: 400,
  reviewLessonExample: 240,
} as const;

type ValidationBoundary = 'input' | 'output';

const fail = (boundary: ValidationBoundary, field: string): never => {
  if (boundary === 'input') {
    throw new AiError('INVALID_INPUT', `Invalid AI input: ${field}`);
  }

  throw new ProviderCallError('unusable-output');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordValue = (
  value: unknown,
  field: string,
  keys: readonly string[],
  boundary: ValidationBoundary,
): Record<string, unknown> => {
  if (isRecord(value)) {
    const actualKeys = Object.keys(value).sort();
    const expectedKeys = [...keys].sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      fail(boundary, field);
    }

    return value;
  }

  return fail(boundary, field);
};

const stringValue = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): string => {
  if (typeof value === 'string') {
    if (value.trim().length === 0 || value.length > maximum) {
      fail(boundary, field);
    }

    return value;
  }

  return fail(boundary, field);
};

const nullableStringValue = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): string | null => {
  if (value === null) {
    return null;
  }

  return stringValue(value, field, maximum, boundary);
};

const positiveIntegerValue = (
  value: unknown,
  field: string,
  maximum: number,
): number => {
  if (
    !Number.isInteger(value) ||
    Number(value) <= 0 ||
    Number(value) > maximum
  ) {
    fail('input', field);
  }

  return Number(value);
};

const nonNegativeIntegerValue = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): number => {
  if (
    !Number.isInteger(value) ||
    Number(value) < 0 ||
    Number(value) > maximum
  ) {
    fail(boundary, field);
  }

  return Number(value);
};

const booleanValue = (
  value: unknown,
  field: string,
  boundary: ValidationBoundary,
): boolean => {
  if (typeof value !== 'boolean') {
    fail(boundary, field);
  }

  return value === true;
};

const confidenceValue = (value: unknown, field: string): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    fail('output', field);
  }

  return Number(value);
};

const enumValue = <T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
  boundary: ValidationBoundary,
): T[number] => {
  if (typeof value === 'string') {
    const matched = allowed.find((item) => item === value);
    if (matched !== undefined) {
      return matched;
    }
  }

  return fail(boundary, field);
};

const arrayValue = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): unknown[] => {
  if (Array.isArray(value)) {
    if (value.length > maximum) {
      fail(boundary, field);
    }

    return value;
  }

  return fail(boundary, field);
};

const requireNonEmptyArray = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): unknown[] => {
  const items = arrayValue(value, field, maximum, boundary);
  if (items.length === 0) {
    fail(boundary, field);
  }

  return items;
};

const uniqueEnumArrayValue = <T extends readonly string[]>(
  value: unknown,
  field: string,
  maximum: number,
  allowed: T,
  boundary: ValidationBoundary,
): T[number][] => {
  const items = requireNonEmptyArray(value, field, maximum, boundary).map(
    (item, index) => enumValue(item, `${field}[${index}]`, allowed, boundary),
  );
  if (new Set(items).size !== items.length) {
    fail(boundary, field);
  }

  return items;
};

const allowedIntegerValue = <T extends readonly number[]>(
  value: unknown,
  field: string,
  allowed: T,
  boundary: ValidationBoundary,
): T[number] => {
  if (typeof value === 'number') {
    const matched = allowed.find((item) => item === value);
    if (matched !== undefined) {
      return matched;
    }
  }

  return fail(boundary, field);
};

const uniqueAllowedIntegerArrayValue = <T extends readonly number[]>(
  value: unknown,
  field: string,
  maximum: number,
  allowed: T,
): T[number][] => {
  const items = requireNonEmptyArray(value, field, maximum, 'input').map(
    (item, index) =>
      allowedIntegerValue(item, `${field}[${index}]`, allowed, 'input'),
  );
  if (new Set(items).size !== items.length) {
    fail('input', field);
  }

  return items;
};

const stringArrayValue = (value: unknown, field: string): string[] => {
  const items = arrayValue(value, field, AI_OUTPUT_LIMITS.listItems, 'output');
  const strings = items.map((item, index) =>
    stringValue(
      item,
      `${field}[${index}]`,
      AI_OUTPUT_LIMITS.listItemText,
      'output',
    ),
  );
  const unique = new Set(
    strings.map((item) => item.trim().toLocaleLowerCase('en-US')),
  );
  if (unique.size !== strings.length) {
    fail('output', field);
  }

  return strings;
};

export const validateTermEnrichmentInput = (
  input: TermEnrichmentInput,
): void => {
  const value = recordValue(
    input,
    'term',
    [
      'articleId',
      'articleTitle',
      'termId',
      'value',
      'lemma',
      'unitType',
      'parentSentenceText',
      'surroundingSentenceContext',
    ],
    'input',
  );

  stringValue(value.articleId, 'articleId', 128, 'input');
  stringValue(value.articleTitle, 'articleTitle', 500, 'input');
  stringValue(value.termId, 'termId', 128, 'input');
  const surfaceValue = stringValue(value.value, 'value', 200, 'input');
  stringValue(value.lemma, 'lemma', 200, 'input');
  enumValue(value.unitType, 'unitType', LEXICAL_UNIT_TYPES, 'input');
  const sentence = stringValue(
    value.parentSentenceText,
    'parentSentenceText',
    10000,
    'input',
  );
  stringValue(
    value.surroundingSentenceContext,
    'surroundingSentenceContext',
    4000,
    'input',
  );

  if (!sentence.includes(surfaceValue)) {
    fail('input', 'value');
  }
};

export const validateReviewQuestionGenerationInput = (
  input: ReviewQuestionGenerationInput,
): void => {
  if (!isRecord(input)) {
    fail('input', 'reviewQuestion');
  }
  const allowedKeys = [
    'wordOrPhrase',
    'lemma',
    'partOfSpeech',
    'contextualMeaningVi',
    'originalSentence',
    'articleTopic',
    'targetCefr',
    'requestedQuestionType',
    'promptStyle',
  ];
  const requiredKeys = allowedKeys.filter((key) => key !== 'articleTopic');
  const actualKeys = Object.keys(input);
  if (
    actualKeys.some((key) => !allowedKeys.includes(key)) ||
    requiredKeys.some((key) => !actualKeys.includes(key))
  ) {
    fail('input', 'reviewQuestion');
  }

  stringValue(input.wordOrPhrase, 'wordOrPhrase', 200, 'input');
  stringValue(input.lemma, 'lemma', 200, 'input');
  stringValue(input.partOfSpeech, 'partOfSpeech', 100, 'input');
  stringValue(input.contextualMeaningVi, 'contextualMeaningVi', 2000, 'input');
  stringValue(input.originalSentence, 'originalSentence', 10000, 'input');
  if (input.articleTopic !== undefined) {
    stringValue(input.articleTopic, 'articleTopic', 200, 'input');
  }
  enumValue(input.targetCefr, 'targetCefr', CEFR_LEVELS, 'input');
  enumValue(
    input.requestedQuestionType,
    'requestedQuestionType',
    REVIEW_QUESTION_TYPES,
    'input',
  );
  enumValue(
    input.promptStyle,
    'promptStyle',
    REVIEW_QUESTION_PROMPT_STYLES,
    'input',
  );
};

export const validateReviewQuestionBatchGenerationInput = (
  inputs: ReviewQuestionGenerationInput[],
): void => {
  if (
    !Array.isArray(inputs) ||
    inputs.length === 0 ||
    inputs.length > REVIEW_QUESTION_BATCH_MAX_SIZE
  ) {
    fail('input', 'reviewQuestionBatch');
  }

  inputs.forEach((input) => validateReviewQuestionGenerationInput(input));
};

const MAX_RESPONSE_TIME_MS = 2_147_483_647;
const MAX_HINTS_USED = 32_767;
const MAX_LAPSE_COUNT = 32_767;
const MAX_DAYS_OVERDUE = 36_500;

const validateAttemptSnapshots = (
  value: unknown,
  field: string,
): ReviewAttemptSnapshot[] =>
  arrayValue(value, field, AI_OUTPUT_LIMITS.reviewRecentAttempts, 'input').map(
    (attempt, index) => {
      const item = recordValue(
        attempt,
        `${field}[${index}]`,
        [
          'questionType',
          'skillDimension',
          'isCorrect',
          'responseTimeMs',
          'hintsUsed',
        ],
        'input',
      );

      return {
        questionType: enumValue(
          item.questionType,
          `${field}[${index}].questionType`,
          REVIEW_QUESTION_TYPES,
          'input',
        ),
        skillDimension: enumValue(
          item.skillDimension,
          `${field}[${index}].skillDimension`,
          AGENTIC_REVIEW_V1_SKILL_DIMENSIONS,
          'input',
        ),
        isCorrect: booleanValue(
          item.isCorrect,
          `${field}[${index}].isCorrect`,
          'input',
        ),
        responseTimeMs: nonNegativeIntegerValue(
          item.responseTimeMs,
          `${field}[${index}].responseTimeMs`,
          MAX_RESPONSE_TIME_MS,
          'input',
        ),
        hintsUsed: nonNegativeIntegerValue(
          item.hintsUsed,
          `${field}[${index}].hintsUsed`,
          MAX_HINTS_USED,
          'input',
        ),
      };
    },
  );

const validateSkillAggregates = (
  value: unknown,
  field: string,
): ReviewSkillAggregate[] => {
  const aggregates = arrayValue(
    value,
    field,
    AI_OUTPUT_LIMITS.reviewSkillAggregates,
    'input',
  ).map((aggregate, index) => {
    const item = recordValue(
      aggregate,
      `${field}[${index}]`,
      ['skillDimension', 'attempts', 'correct', 'averageResponseTimeMs'],
      'input',
    );
    const attempts = nonNegativeIntegerValue(
      item.attempts,
      `${field}[${index}].attempts`,
      10_000,
      'input',
    );
    const correct = nonNegativeIntegerValue(
      item.correct,
      `${field}[${index}].correct`,
      10_000,
      'input',
    );
    if (correct > attempts) {
      fail('input', `${field}[${index}].correct`);
    }

    return {
      skillDimension: enumValue(
        item.skillDimension,
        `${field}[${index}].skillDimension`,
        AGENTIC_REVIEW_V1_SKILL_DIMENSIONS,
        'input',
      ),
      attempts,
      correct,
      averageResponseTimeMs: nonNegativeIntegerValue(
        item.averageResponseTimeMs,
        `${field}[${index}].averageResponseTimeMs`,
        MAX_RESPONSE_TIME_MS,
        'input',
      ),
    };
  });
  if (
    new Set(aggregates.map(({ skillDimension }) => skillDimension)).size !==
    aggregates.length
  ) {
    fail('input', field);
  }

  return aggregates;
};

export const validatePlanReviewSessionInput = (
  input: PlanReviewSessionInput,
): void => {
  const value = recordValue(
    input,
    'reviewSessionPlan',
    [
      'targetCefr',
      'reviewGoal',
      'targetDurationMinutes',
      'maxItemCount',
      'allowedFocusDimensions',
      'candidates',
      'skillAggregates',
    ],
    'input',
  );

  enumValue(value.targetCefr, 'targetCefr', CEFR_LEVELS, 'input');
  enumValue(value.reviewGoal, 'reviewGoal', REVIEW_GOALS, 'input');
  allowedIntegerValue(
    value.targetDurationMinutes,
    'targetDurationMinutes',
    REVIEW_TARGET_DURATIONS,
    'input',
  );
  positiveIntegerValue(
    value.maxItemCount,
    'maxItemCount',
    AI_OUTPUT_LIMITS.reviewCandidates,
  );
  uniqueEnumArrayValue(
    value.allowedFocusDimensions,
    'allowedFocusDimensions',
    AGENTIC_REVIEW_V1_SKILL_DIMENSIONS.length,
    AGENTIC_REVIEW_V1_SKILL_DIMENSIONS,
    'input',
  );

  const candidates = requireNonEmptyArray(
    value.candidates,
    'candidates',
    AI_OUTPUT_LIMITS.reviewCandidates,
    'input',
  );
  const aliases = new Set<string>();
  for (const [index, candidate] of candidates.entries()) {
    const item = recordValue(
      candidate,
      `candidates[${index}]`,
      [
        'alias',
        'wordOrPhrase',
        'lemma',
        'partOfSpeech',
        'contextualMeaningVi',
        'originalSentence',
        'daysOverdue',
        'lapseCount',
        'recentAttempts',
      ],
      'input',
    );
    const alias = stringValue(
      item.alias,
      `candidates[${index}].alias`,
      AI_OUTPUT_LIMITS.reviewAlias,
      'input',
    );
    if (!/^[a-z][a-z0-9_-]*$/u.test(alias) || aliases.has(alias)) {
      fail('input', `candidates[${index}].alias`);
    }
    aliases.add(alias);
    stringValue(
      item.wordOrPhrase,
      `candidates[${index}].wordOrPhrase`,
      AI_OUTPUT_LIMITS.termText,
      'input',
    );
    stringValue(
      item.lemma,
      `candidates[${index}].lemma`,
      AI_OUTPUT_LIMITS.termText,
      'input',
    );
    stringValue(
      item.partOfSpeech,
      `candidates[${index}].partOfSpeech`,
      AI_OUTPUT_LIMITS.partOfSpeech,
      'input',
    );
    stringValue(
      item.contextualMeaningVi,
      `candidates[${index}].contextualMeaningVi`,
      AI_OUTPUT_LIMITS.enrichmentText,
      'input',
    );
    stringValue(
      item.originalSentence,
      `candidates[${index}].originalSentence`,
      10_000,
      'input',
    );
    nonNegativeIntegerValue(
      item.daysOverdue,
      `candidates[${index}].daysOverdue`,
      MAX_DAYS_OVERDUE,
      'input',
    );
    nonNegativeIntegerValue(
      item.lapseCount,
      `candidates[${index}].lapseCount`,
      MAX_LAPSE_COUNT,
      'input',
    );
    validateAttemptSnapshots(
      item.recentAttempts,
      `candidates[${index}].recentAttempts`,
    );
  }

  validateSkillAggregates(value.skillAggregates, 'skillAggregates');
};

export const validateDiagnoseReviewAnswerInput = (
  input: DiagnoseReviewAnswerInput,
): void => {
  const value = recordValue(
    input,
    'reviewAnswerDiagnosis',
    [
      'targetCefr',
      'wordOrPhrase',
      'lemma',
      'partOfSpeech',
      'contextualMeaningVi',
      'originalSentence',
      'questionType',
      'learnerAnswer',
      'correctAnswer',
      'responseTimeMs',
      'hintsUsed',
      'attemptNumber',
      'recentAttempts',
      'skillAggregates',
      'allowedSkillDimensions',
      'allowedActions',
      'allowedRetestQuestionTypes',
      'allowedRetestAfterItems',
    ],
    'input',
  );

  enumValue(value.targetCefr, 'targetCefr', CEFR_LEVELS, 'input');
  stringValue(
    value.wordOrPhrase,
    'wordOrPhrase',
    AI_OUTPUT_LIMITS.termText,
    'input',
  );
  stringValue(value.lemma, 'lemma', AI_OUTPUT_LIMITS.termText, 'input');
  stringValue(
    value.partOfSpeech,
    'partOfSpeech',
    AI_OUTPUT_LIMITS.partOfSpeech,
    'input',
  );
  stringValue(
    value.contextualMeaningVi,
    'contextualMeaningVi',
    AI_OUTPUT_LIMITS.enrichmentText,
    'input',
  );
  stringValue(value.originalSentence, 'originalSentence', 10_000, 'input');
  const questionType = enumValue(
    value.questionType,
    'questionType',
    REVIEW_QUESTION_TYPES,
    'input',
  );
  stringValue(
    value.learnerAnswer,
    'learnerAnswer',
    AI_OUTPUT_LIMITS.reviewAnswer,
    'input',
  );
  stringValue(
    value.correctAnswer,
    'correctAnswer',
    AI_OUTPUT_LIMITS.reviewAnswer,
    'input',
  );
  nonNegativeIntegerValue(
    value.responseTimeMs,
    'responseTimeMs',
    MAX_RESPONSE_TIME_MS,
    'input',
  );
  nonNegativeIntegerValue(
    value.hintsUsed,
    'hintsUsed',
    MAX_HINTS_USED,
    'input',
  );
  positiveIntegerValue(value.attemptNumber, 'attemptNumber', 2);
  validateAttemptSnapshots(value.recentAttempts, 'recentAttempts');
  validateSkillAggregates(value.skillAggregates, 'skillAggregates');
  uniqueEnumArrayValue(
    value.allowedSkillDimensions,
    'allowedSkillDimensions',
    AGENTIC_REVIEW_V1_SKILL_DIMENSIONS.length,
    AGENTIC_REVIEW_V1_SKILL_DIMENSIONS,
    'input',
  );
  uniqueEnumArrayValue(
    value.allowedActions,
    'allowedActions',
    REVIEW_AGENT_ACTIONS.length,
    REVIEW_AGENT_ACTIONS,
    'input',
  );
  const allowedRetestQuestionTypes = uniqueEnumArrayValue(
    value.allowedRetestQuestionTypes,
    'allowedRetestQuestionTypes',
    REVIEW_QUESTION_TYPES.length,
    REVIEW_QUESTION_TYPES,
    'input',
  );
  if (
    allowedRetestQuestionTypes.every(
      (allowedQuestionType) => allowedQuestionType === questionType,
    )
  ) {
    fail('input', 'allowedRetestQuestionTypes');
  }
  uniqueAllowedIntegerArrayValue(
    value.allowedRetestAfterItems,
    'allowedRetestAfterItems',
    REVIEW_RETEST_AFTER_ITEMS.length,
    REVIEW_RETEST_AFTER_ITEMS,
  );
};

const parseExample = (value: unknown, index: number): TermExample => {
  const example = recordValue(
    value,
    `examples[${index}]`,
    ['sentence', 'translationVi'],
    'output',
  );

  return {
    sentence: stringValue(
      example.sentence,
      `examples[${index}].sentence`,
      AI_OUTPUT_LIMITS.exampleSentence,
      'output',
    ),
    translationVi: stringValue(
      example.translationVi,
      `examples[${index}].translationVi`,
      AI_OUTPUT_LIMITS.exampleTranslation,
      'output',
    ),
  };
};

export const parseTermEnrichmentResult = (
  raw: unknown,
  input: TermEnrichmentInput,
): TermEnrichmentResult => {
  const result = recordValue(
    raw,
    'result',
    [
      'wordDisplay',
      'normalizedLemma',
      'partOfSpeech',
      'cefrLevel',
      'contextualMeaningVi',
      'definitionEn',
      'contextualExplanation',
      'ipa',
      'synonyms',
      'antonyms',
      'collocations',
      'relatedTerms',
      'vocabularyTopic',
      'examples',
      'sentenceTranslationVi',
    ],
    'output',
  );

  const examples = arrayValue(
    result.examples,
    'examples',
    AI_OUTPUT_LIMITS.examples,
    'output',
  ).map(parseExample);
  const uniqueExamples = new Set(
    examples.map(({ sentence }) => sentence.trim().toLocaleLowerCase('en-US')),
  );
  if (uniqueExamples.size !== examples.length) {
    fail('output', 'examples');
  }

  const normalizedLemma = stringValue(
    result.normalizedLemma,
    'normalizedLemma',
    AI_OUTPUT_LIMITS.termText,
    'output',
  ).toLocaleLowerCase('en-US');
  if (normalizedLemma !== input.lemma.trim().toLocaleLowerCase('en-US')) {
    fail('output', 'normalizedLemma');
  }

  return {
    wordDisplay: stringValue(
      result.wordDisplay,
      'wordDisplay',
      AI_OUTPUT_LIMITS.termText,
      'output',
    ),
    normalizedLemma,
    partOfSpeech: stringValue(
      result.partOfSpeech,
      'partOfSpeech',
      AI_OUTPUT_LIMITS.partOfSpeech,
      'output',
    ).toLocaleLowerCase('en-US'),
    cefrLevel: enumValue(result.cefrLevel, 'cefrLevel', CEFR_LEVELS, 'output'),
    contextualMeaningVi: stringValue(
      result.contextualMeaningVi,
      'contextualMeaningVi',
      AI_OUTPUT_LIMITS.enrichmentText,
      'output',
    ),
    definitionEn: stringValue(
      result.definitionEn,
      'definitionEn',
      AI_OUTPUT_LIMITS.enrichmentText,
      'output',
    ),
    contextualExplanation: stringValue(
      result.contextualExplanation,
      'contextualExplanation',
      AI_OUTPUT_LIMITS.enrichmentText,
      'output',
    ),
    ipa: nullableStringValue(result.ipa, 'ipa', AI_OUTPUT_LIMITS.ipa, 'output'),
    synonyms: stringArrayValue(result.synonyms, 'synonyms'),
    antonyms: stringArrayValue(result.antonyms, 'antonyms'),
    collocations: stringArrayValue(result.collocations, 'collocations'),
    relatedTerms: stringArrayValue(result.relatedTerms, 'relatedTerms'),
    vocabularyTopic: nullableStringValue(
      result.vocabularyTopic,
      'vocabularyTopic',
      AI_OUTPUT_LIMITS.vocabularyTopic,
      'output',
    ),
    examples,
    sentenceTranslationVi: stringValue(
      result.sentenceTranslationVi,
      'sentenceTranslationVi',
      AI_OUTPUT_LIMITS.sentenceTranslation,
      'output',
    ),
  };
};

const normalizeAnswer = (value: string): string =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');

const normalizeForPromptInspection = (value: string): string =>
  value
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/\p{M}+/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const hasRawMarkdown = (value: string): boolean =>
  /(?:```|`[^`\n]+`|\*\*|__|!\[[^\]]*\]\([^)\n]+\)|\[[^\]]+\]\([^)\n]+\)|(?:^|\n)\s{0,3}(?:#{1,6}|>|[-+*])\s)/u.test(
    value,
  ) || /(?:^|[\s(])(?:\*[^*\n]+\*|_[^_\n]+_)(?=$|[\s).,!?:;])/u.test(value);

const validatePlainGeneratedText = (value: string, field: string): void => {
  if (hasRawMarkdown(value)) {
    fail('output', field);
  }
};

const containsNormalizedText = (value: string, expected: string): boolean => {
  const normalizedExpected = normalizeForPromptInspection(expected);
  if (normalizedExpected.length < 3) return false;

  const normalizedValue = normalizeForPromptInspection(value);
  return ` ${normalizedValue} `.includes(` ${normalizedExpected} `);
};

const expectedPromptAnswer = (input: ReviewQuestionGenerationInput): string =>
  input.requestedQuestionType === 'SELECT_MEANING'
    ? input.contextualMeaningVi
    : input.requestedQuestionType === 'SELECT_CORRECT_CONTEXT'
      ? input.originalSentence
      : input.wordOrPhrase;

const validateReviewPromptQuality = (
  prompt: string,
  input: ReviewQuestionGenerationInput,
): void => {
  validatePlainGeneratedText(prompt, 'prompt');
  const normalizedPrompt = normalizeForPromptInspection(prompt);
  if (
    /\bwhat\s+(?:is|does)\b.*\b(?:mean|meaning)\b/u.test(normalizedPrompt) ||
    normalizedPrompt.includes('in the context of the sentence') ||
    normalizedPrompt.includes('provided context') ||
    containsNormalizedText(prompt, expectedPromptAnswer(input))
  ) {
    fail('output', 'prompt');
  }
};

const validateShortExplanation = (value: unknown): string => {
  const explanation = stringValue(
    value,
    'answerExplanation',
    AI_OUTPUT_LIMITS.reviewExplanation,
    'output',
  );
  const sentences = explanation.trim().split(/(?<=[.!?])\s+/u);
  if (
    sentences.length < 2 ||
    sentences.length > 3 ||
    sentences.some(
      (sentence) =>
        sentence.length > AI_OUTPUT_LIMITS.reviewExplanationSentence ||
        !/[.!?]$/u.test(sentence),
    )
  ) {
    fail('output', 'answerExplanation');
  }
  validatePlainGeneratedText(explanation, 'answerExplanation');
  return explanation;
};

const parseReviewOption = (
  value: unknown,
  index: number,
): ReviewQuestionGenerationOption => {
  const option = recordValue(
    value,
    `options[${index}]`,
    ['optionText', 'isCorrect'],
    'output',
  );
  const isCorrect = option.isCorrect;
  if (typeof isCorrect === 'boolean') {
    return {
      optionText: stringValue(
        option.optionText,
        `options[${index}].optionText`,
        AI_OUTPUT_LIMITS.reviewAnswer,
        'output',
      ),
      isCorrect,
    };
  }
  return fail('output', `options[${index}].isCorrect`);
};

export const parseReviewQuestionGenerationResult = (
  raw: unknown,
  input: ReviewQuestionGenerationInput,
): ReviewQuestionGenerationResult => {
  const result = recordValue(
    raw,
    'result',
    [
      'prompt',
      'blankSentence',
      'correctAnswerText',
      'answerExplanation',
      'options',
    ],
    'output',
  );
  const prompt = stringValue(
    result.prompt,
    'prompt',
    AI_OUTPUT_LIMITS.reviewPrompt,
    'output',
  );
  validateReviewPromptQuality(prompt, input);
  const answerExplanation = validateShortExplanation(result.answerExplanation);
  const rawOptions = arrayValue(
    result.options,
    'options',
    AI_OUTPUT_LIMITS.reviewOptions,
    'output',
  );
  const options = rawOptions.map(parseReviewOption);

  if (input.requestedQuestionType === 'FILL_BLANK') {
    const blankSentence = stringValue(
      result.blankSentence,
      'blankSentence',
      AI_OUTPUT_LIMITS.reviewAnswer,
      'output',
    );
    stringValue(
      result.correctAnswerText,
      'correctAnswerText',
      AI_OUTPUT_LIMITS.reviewAnswer,
      'output',
    );
    if (
      (blankSentence.match(/___/gu) ?? []).length !== 1 ||
      options.length !== 0 ||
      containsNormalizedText(blankSentence, input.wordOrPhrase)
    ) {
      fail('output', 'fillBlank');
    }
    validatePlainGeneratedText(
      blankSentence.replace('___', ''),
      'blankSentence',
    );
    return {
      prompt,
      blankSentence,
      correctAnswerText: input.wordOrPhrase,
      answerExplanation,
      options,
    };
  }

  if (
    result.blankSentence !== null ||
    result.correctAnswerText !== null ||
    options.length < 3
  ) {
    fail('output', 'options');
  }
  const correct = options.filter(({ isCorrect }) => isCorrect);
  if (correct.length !== 1) {
    fail('output', 'options.isCorrect');
  }
  const expectedAnswer =
    input.requestedQuestionType === 'SELECT_MEANING'
      ? input.contextualMeaningVi
      : input.requestedQuestionType === 'SELECT_WORD'
        ? input.wordOrPhrase
        : input.originalSentence;
  options
    .filter(({ isCorrect }) => !isCorrect)
    .forEach(({ optionText }, index) =>
      validatePlainGeneratedText(optionText, `options[${index}].optionText`),
    );
  const canonicalOptions = options.map((option) =>
    option.isCorrect ? { ...option, optionText: expectedAnswer } : option,
  );
  const normalizedOptions = canonicalOptions.map(({ optionText }) =>
    normalizeAnswer(optionText),
  );
  if (new Set(normalizedOptions).size !== canonicalOptions.length) {
    fail('output', 'options');
  }

  return {
    prompt,
    blankSentence: null,
    correctAnswerText: null,
    answerExplanation,
    options: canonicalOptions,
  };
};

export const parseReviewQuestionBatchGenerationResult = (
  raw: unknown,
  inputs: ReviewQuestionGenerationInput[],
): ReviewQuestionBatchGenerationResult => {
  validateReviewQuestionBatchGenerationInput(inputs);
  const result = recordValue(raw, 'result', ['questions'], 'output');
  const questions = arrayValue(
    result.questions,
    'questions',
    REVIEW_QUESTION_BATCH_MAX_SIZE,
    'output',
  );
  if (questions.length !== inputs.length) {
    fail('output', 'questions');
  }

  return questions.map((value, index) => {
    const item = recordValue(
      value,
      `questions[${index}]`,
      [
        'inputIndex',
        'prompt',
        'blankSentence',
        'correctAnswerText',
        'answerExplanation',
        'options',
      ],
      'output',
    );
    const inputIndex = nonNegativeIntegerValue(
      item.inputIndex,
      `questions[${index}].inputIndex`,
      inputs.length - 1,
      'output',
    );
    if (inputIndex !== index) {
      fail('output', `questions[${index}].inputIndex`);
    }
    const input = inputs[index];
    if (!input) {
      fail('output', `questions[${index}]`);
    }

    return parseReviewQuestionGenerationResult(
      {
        prompt: item.prompt,
        blankSentence: item.blankSentence,
        correctAnswerText: item.correctAnswerText,
        answerExplanation: item.answerExplanation,
        options: item.options,
      },
      input,
    );
  });
};

export const parseReviewSessionPlanResult = (
  raw: unknown,
  input: PlanReviewSessionInput,
): ReviewSessionPlanResult => {
  const result = recordValue(
    raw,
    'result',
    [
      'reviewGoal',
      'focusDimensions',
      'orderedCandidateAliases',
      'summary',
      'confidence',
    ],
    'output',
  );
  const focusDimensions = uniqueEnumArrayValue(
    result.focusDimensions,
    'focusDimensions',
    AI_OUTPUT_LIMITS.reviewPlanFocusDimensions,
    input.allowedFocusDimensions,
    'output',
  );
  const aliases = requireNonEmptyArray(
    result.orderedCandidateAliases,
    'orderedCandidateAliases',
    Math.min(input.maxItemCount, input.candidates.length),
    'output',
  ).map((alias, index) =>
    stringValue(
      alias,
      `orderedCandidateAliases[${index}]`,
      AI_OUTPUT_LIMITS.reviewAlias,
      'output',
    ),
  );
  const allowedAliases = new Set(input.candidates.map(({ alias }) => alias));
  if (
    new Set(aliases).size !== aliases.length ||
    aliases.some((alias) => !allowedAliases.has(alias))
  ) {
    fail('output', 'orderedCandidateAliases');
  }

  return {
    reviewGoal: enumValue(
      result.reviewGoal,
      'reviewGoal',
      [input.reviewGoal],
      'output',
    ),
    focusDimensions,
    orderedCandidateAliases: aliases,
    summary: stringValue(
      result.summary,
      'summary',
      AI_OUTPUT_LIMITS.reviewPlanSummary,
      'output',
    ),
    confidence: confidenceValue(result.confidence, 'confidence'),
  };
};

export const parseReviewAnswerDiagnosisResult = (
  raw: unknown,
  input: DiagnoseReviewAnswerInput,
): ReviewAnswerDiagnosisResult => {
  const result = recordValue(
    raw,
    'result',
    [
      'action',
      'skillDimension',
      'errorType',
      'confidence',
      'reasonCode',
      'microLesson',
      'retest',
    ],
    'output',
  );
  const action = enumValue(
    result.action,
    'action',
    input.allowedActions,
    'output',
  );
  const reasonCode = stringValue(
    result.reasonCode,
    'reasonCode',
    AI_OUTPUT_LIMITS.reviewReasonCode,
    'output',
  );
  if (!/^[A-Z][A-Z0-9_]*$/u.test(reasonCode)) {
    fail('output', 'reasonCode');
  }

  let microLesson: ReviewAnswerDiagnosisResult['microLesson'] = null;
  if (result.microLesson !== null) {
    const lesson = recordValue(
      result.microLesson,
      'microLesson',
      ['title', 'explanation', 'example'],
      'output',
    );
    microLesson = {
      title: stringValue(
        lesson.title,
        'microLesson.title',
        AI_OUTPUT_LIMITS.reviewLessonTitle,
        'output',
      ),
      explanation: stringValue(
        lesson.explanation,
        'microLesson.explanation',
        AI_OUTPUT_LIMITS.reviewLessonExplanation,
        'output',
      ),
      example: stringValue(
        lesson.example,
        'microLesson.example',
        AI_OUTPUT_LIMITS.reviewLessonExample,
        'output',
      ),
    };
  }

  let retest: ReviewAnswerDiagnosisResult['retest'] = null;
  if (result.retest !== null) {
    const retestValue = recordValue(
      result.retest,
      'retest',
      ['questionType', 'afterItems'],
      'output',
    );
    const questionType = enumValue(
      retestValue.questionType,
      'retest.questionType',
      input.allowedRetestQuestionTypes,
      'output',
    );
    if (questionType === input.questionType) {
      fail('output', 'retest.questionType');
    }
    retest = {
      questionType,
      afterItems: allowedIntegerValue(
        retestValue.afterItems,
        'retest.afterItems',
        input.allowedRetestAfterItems,
        'output',
      ),
    };
  }

  if (
    (action === 'CONTINUE' || action === 'FLAG_FOR_FUTURE_FOCUS') &&
    (microLesson !== null || retest !== null)
  ) {
    fail('output', 'action');
  }
  if (
    action === 'REQUEUE_WITH_NEW_TYPE' &&
    (microLesson !== null || retest === null)
  ) {
    fail('output', 'action');
  }
  if (
    action === 'TEACH_AND_REQUEUE' &&
    (microLesson === null || retest === null)
  ) {
    fail('output', 'action');
  }

  return {
    action,
    skillDimension: enumValue(
      result.skillDimension,
      'skillDimension',
      input.allowedSkillDimensions,
      'output',
    ),
    errorType: enumValue(
      result.errorType,
      'errorType',
      REVIEW_ERROR_TYPES,
      'output',
    ),
    confidence: confidenceValue(result.confidence, 'confidence'),
    reasonCode,
    microLesson,
    retest,
  };
};

export const parseProviderJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    throw new ProviderCallError('unusable-output');
  }
};
