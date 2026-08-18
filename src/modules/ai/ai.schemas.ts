import {
  CEFR_LEVELS,
  REVIEW_ERROR_TYPES,
  type DiagnoseReviewAnswerInput,
  type PlanReviewSessionInput,
  type ReviewQuestionGenerationInput,
  type ReviewQuestionPromptStyle,
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

const promptStyleGuidance = (style: ReviewQuestionPromptStyle): string => {
  switch (style) {
    case 'QUICK_MATCH':
      return 'Frame the task as a quick, direct match.';
    case 'CONTEXT_CLUE':
      return 'Invite the learner to use a concise contextual clue.';
    case 'MINI_CHALLENGE':
      return 'Frame the task as a short, friendly challenge.';
    case 'REAL_WORLD_USE':
      return 'Use a practical everyday-use framing without inventing facts.';
  }
};

const questionTypePromptGuidance = (
  input: ReviewQuestionGenerationInput,
): string => {
  switch (input.requestedQuestionType) {
    case 'SELECT_MEANING':
      return 'Ask the learner to choose the saved Vietnamese meaning using the supplied sentence as evidence; the prompt may name wordOrPhrase but must not reveal contextualMeaningVi.';
    case 'SELECT_WORD':
      return 'Ask the learner to identify the saved word or phrase from its meaning or use; do not include wordOrPhrase in the prompt.';
    case 'SELECT_CORRECT_CONTEXT':
      return 'Ask which option uses wordOrPhrase with the supplied meaning; do not copy originalSentence into the prompt.';
    case 'FILL_BLANK':
      return 'Invite the learner to complete a fresh natural sentence; do not include wordOrPhrase in the prompt or outside the blank.';
  }
};

const promptDescription = (input: ReviewQuestionGenerationInput): string =>
  [
    `One engaging learner-facing sentence no harder than ${input.targetCefr}.`,
    `Follow promptStyle ${input.promptStyle}.`,
    promptStyleGuidance(input.promptStyle),
    questionTypePromptGuidance(input),
    'Do not use raw Markdown.',
    'Do not use generic What is/does ... mean/meaning wording, in the context of the sentence, or provided context.',
  ].join(' ');

const reviewQuestionProperties = (
  input: ReviewQuestionGenerationInput,
): Record<string, JsonSchema> => {
  return {
    prompt: requiredString(promptDescription(input)),
    blankSentence: {
      type: input.requestedQuestionType === 'FILL_BLANK' ? 'string' : 'null',
      description:
        input.requestedQuestionType === 'FILL_BLANK'
          ? 'One fresh, natural target-level example sentence with exactly one ___ blank and no other copy of wordOrPhrase.'
          : 'Must be null for an option-based question.',
    },
    answerExplanation: requiredString(
      'Exactly two or three short plain-text sentences explaining the correct answer, with no Markdown.',
    ),
    distractors: {
      type: 'array',
      minItems: input.requestedQuestionType === 'FILL_BLANK' ? 0 : 2,
      maxItems: input.requestedQuestionType === 'FILL_BLANK' ? 0 : 3,
      description:
        input.requestedQuestionType === 'FILL_BLANK'
          ? 'Must be empty.'
          : 'Two or three distinct plain-text incorrect options. Never include or paraphrase the authoritative correct answer.',
      items: requiredString('One distinct, plausible, but incorrect option.'),
    },
  };
};

export const reviewQuestionGenerationSchema = (
  input: ReviewQuestionGenerationInput,
): JsonSchema => strictObject(reviewQuestionProperties(input));

export const reviewQuestionBatchGenerationSchema = (
  inputs: ReviewQuestionGenerationInput[],
): JsonSchema =>
  strictObject({
    questions: {
      type: 'array',
      minItems: inputs.length,
      maxItems: inputs.length,
      description:
        'Exactly one question for every supplied input, in the same order. inputIndex must equal the zero-based array position.',
      items: strictObject({
        inputIndex: {
          type: 'integer',
          minimum: 0,
          maximum: Math.max(0, inputs.length - 1),
          description:
            'The zero-based position of the matching input; items must remain in exact input order.',
        },
        prompt: requiredString(
          'One engaging plain-text prompt that follows the matching input promptStyle, requestedQuestionType and targetCefr. Do not use generic What is/does ... mean/meaning wording, in the context of the sentence, or provided context. Never reveal the matching correct answer.',
        ),
        blankSentence: {
          type: ['string', 'null'],
          description:
            'For FILL_BLANK, one fresh sentence with exactly one ___ blank; otherwise null.',
        },
        answerExplanation: requiredString(
          'Exactly two or three short plain-text sentences explaining the correct answer.',
        ),
        distractors: {
          type: 'array',
          maxItems: 3,
          description:
            'For an option question, two or three distinct plausible but incorrect options; for FILL_BLANK, empty. Never return the authoritative correct answer.',
          items: requiredString(
            'One distinct, plausible, but incorrect option.',
          ),
        },
      }),
    },
  });

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
