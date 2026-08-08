import {
  CEFR_LEVELS,
  LEXICAL_UNIT_TYPES,
  REVIEW_ERROR_TYPES,
  type ArticleAnalysisInput,
  type DiagnoseReviewAnswerInput,
  type PlanReviewSessionInput,
  type ReviewQuestionGenerationInput,
} from './ai.contracts';

type JsonSchema = Record<string, unknown>;

const requiredString = (description: string): JsonSchema => ({
  type: 'string',
  description,
});

const strictObject = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const boundedString = (description: string, maxLength: number): JsonSchema => ({
  type: 'string',
  minLength: 1,
  maxLength,
  description,
});

const confidenceSchema: JsonSchema = {
  type: 'number',
  minimum: 0,
  maximum: 1,
  description: 'Confidence from zero to one.',
};

export const articleAnalysisSchema = (
  input: ArticleAnalysisInput,
): JsonSchema =>
  strictObject({
    summaryEn: requiredString('A concise English summary of the article.'),
    cefrLevel: {
      type: 'string',
      enum: CEFR_LEVELS,
      description: 'The overall article CEFR difficulty.',
    },
    categorySlug: {
      type: 'string',
      enum: input.allowedCategories.map(({ slug }) => slug),
      description: 'Exactly one slug from the supplied allowed categories.',
    },
    terms: {
      type: 'array',
      maxItems: input.maxTermCount,
      description: 'Contextual vocabulary candidates in sentence order.',
      items: strictObject({
        sentenceId: {
          type: 'string',
          enum: input.sentences.map(({ sentenceId }) => sentenceId),
          description: 'The supplied sentence identifier.',
        },
        value: requiredString(
          'The exact case-sensitive surface text copied from the sentence.',
        ),
        wordDisplay: requiredString('Learner-facing display form.'),
        lemma: requiredString('Dictionary lemma.'),
        normalizedLemma: requiredString(
          'Trimmed lowercase lemma used for normalization.',
        ),
        unitType: {
          type: 'string',
          enum: LEXICAL_UNIT_TYPES,
        },
        partOfSpeech: requiredString('Part of speech in English.'),
        cefrLevel: {
          type: 'string',
          enum: CEFR_LEVELS,
        },
        selectionReason: requiredString(
          'A concise reason this contextual term helps learners.',
        ),
      }),
    },
  });

const boundedStringArray = (description: string): JsonSchema => ({
  type: 'array',
  maxItems: 8,
  description,
  items: { type: 'string' },
});

export const termEnrichmentSchema: JsonSchema = strictObject({
  wordDisplay: requiredString('Learner-facing display form.'),
  normalizedLemma: requiredString(
    'Trimmed lowercase lemma used for normalization.',
  ),
  partOfSpeech: requiredString('Part of speech in this sentence context.'),
  cefrLevel: {
    type: 'string',
    enum: CEFR_LEVELS,
    description: 'CEFR difficulty of this contextual term.',
  },
  contextualMeaningVi: requiredString(
    'The Vietnamese meaning in this exact sentence context.',
  ),
  definitionEn: requiredString('A concise English definition.'),
  contextualExplanation: requiredString(
    'A concise explanation of how the term works in this context.',
  ),
  ipa: {
    type: ['string', 'null'],
    description: 'IPA pronunciation, or null when unavailable.',
  },
  synonyms: boundedStringArray('Contextually relevant synonyms.'),
  antonyms: boundedStringArray('Contextually relevant antonyms.'),
  collocations: boundedStringArray('Useful collocations.'),
  relatedTerms: boundedStringArray('Closely related vocabulary.'),
  vocabularyTopic: {
    type: ['string', 'null'],
    description: 'A concise vocabulary topic, or null.',
  },
  examples: {
    type: 'array',
    maxItems: 2,
    items: strictObject({
      sentence: requiredString('A natural English example sentence.'),
      translationVi: requiredString(
        'The Vietnamese translation of that example.',
      ),
    }),
  },
  sentenceTranslationVi: requiredString(
    'Vietnamese translation of the supplied parent sentence.',
  ),
});

export const reviewQuestionGenerationSchema = (
  input: ReviewQuestionGenerationInput,
): JsonSchema => {
  const optionInstruction =
    input.requestedQuestionType === 'SELECT_MEANING'
      ? 'The one correct option must exactly copy contextualMeaningVi from the supplied input.'
      : input.requestedQuestionType === 'SELECT_WORD'
        ? 'The one correct option must exactly copy wordOrPhrase from the supplied input.'
        : input.requestedQuestionType === 'SELECT_CORRECT_CONTEXT'
          ? 'The one correct option must exactly copy originalSentence from the supplied input.'
          : 'Must be empty.';

  return strictObject({
    prompt: requiredString(
      `A concise learner-facing prompt no harder than ${input.targetCefr}.`,
    ),
    blankSentence: {
      type: input.requestedQuestionType === 'FILL_BLANK' ? 'string' : 'null',
      description:
        input.requestedQuestionType === 'FILL_BLANK'
          ? 'One natural target-level example sentence with exactly one ___ blank.'
          : 'Must be null for an option-based question.',
    },
    correctAnswerText: {
      type: input.requestedQuestionType === 'FILL_BLANK' ? 'string' : 'null',
      description:
        input.requestedQuestionType === 'FILL_BLANK'
          ? 'The one unambiguous text answer.'
          : 'Must be null for an option-based question.',
    },
    answerExplanation: requiredString(
      'Exactly two or three short sentences explaining the correct answer.',
    ),
    options: {
      type: 'array',
      maxItems: 4,
      description:
        input.requestedQuestionType === 'FILL_BLANK'
          ? 'Must be empty.'
          : `Three or four distinct options with exactly one correct answer. ${optionInstruction}`,
      items: strictObject({
        optionText: requiredString(
          `One distinct answer option. ${optionInstruction}`,
        ),
        isCorrect: {
          type: 'boolean',
          description: 'True for exactly one option.',
        },
      }),
    },
  });
};

export const reviewSessionPlanSchema = (
  input: PlanReviewSessionInput,
): JsonSchema =>
  strictObject({
    reviewGoal: {
      type: 'string',
      enum: [input.reviewGoal],
      description: 'The server-supplied review goal; do not replace it.',
    },
    focusDimensions: {
      type: 'array',
      minItems: 1,
      maxItems: Math.min(3, input.allowedFocusDimensions.length),
      uniqueItems: true,
      items: {
        type: 'string',
        enum: input.allowedFocusDimensions,
      },
      description: 'One to three server-allowed skill dimensions.',
    },
    orderedCandidateAliases: {
      type: 'array',
      minItems: 1,
      maxItems: Math.min(input.maxItemCount, input.candidates.length),
      uniqueItems: true,
      items: {
        type: 'string',
        enum: input.candidates.map(({ alias }) => alias),
      },
      description:
        'A bounded ranking containing only supplied opaque aliases, never identifiers.',
    },
    summary: boundedString(
      `A concise learner-facing plan at or below ${input.targetCefr}.`,
      300,
    ),
    confidence: confidenceSchema,
  });

const nullableStrictObject = (
  properties: Record<string, JsonSchema>,
): JsonSchema => ({
  type: ['object', 'null'],
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const reviewAnswerDiagnosisSchema = (
  input: DiagnoseReviewAnswerInput,
): JsonSchema =>
  strictObject({
    action: {
      type: 'string',
      enum: input.allowedActions,
      description: 'One server-allowed advisory action.',
    },
    skillDimension: {
      type: 'string',
      enum: input.allowedSkillDimensions,
      description: 'One server-allowed weak skill dimension.',
    },
    errorType: {
      type: 'string',
      enum: REVIEW_ERROR_TYPES,
      description: 'One closed error classification.',
    },
    confidence: confidenceSchema,
    reasonCode: {
      type: 'string',
      minLength: 1,
      maxLength: 80,
      pattern: '^[A-Z][A-Z0-9_]{0,79}$',
      description: 'A concise machine-readable reason code.',
    },
    microLesson: nullableStrictObject({
      title: boundedString('A concise lesson title.', 80),
      explanation: boundedString(
        `A concise explanation at or below ${input.targetCefr}.`,
        400,
      ),
      example: boundedString('One concise English example.', 240),
    }),
    retest: nullableStrictObject({
      questionType: {
        type: 'string',
        enum: input.allowedRetestQuestionTypes,
        description: 'One server-allowed question type.',
      },
      afterItems: {
        type: 'integer',
        enum: input.allowedRetestAfterItems,
        description: 'One server-allowed retest offset.',
      },
    }),
  });
