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
    'One concise Vietnamese meaning in this exact sentence context, using at most four whitespace-separated words and no alternatives, commentary, or parenthetical text.',
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
      return 'Use only a direct cue and the mandatory question-type wording; add no story or warm-up.';
    case 'CONTEXT_CLUE':
      return 'Use one short exact source clause when originalSentence is supplied, or one short concrete situation otherwise.';
    case 'MINI_CHALLENGE':
      return 'Add only one fair distinction, intent, contrast, cause, result, or collocation signal before the mandatory question-type wording.';
    case 'REAL_WORLD_USE':
      return 'Use one short fictional message, class, travel, or workplace situation only when the question type permits fresh context; never rewrite a named source subject into a new event.';
  }
};

const questionTypePromptGuidance = (
  input: ReviewQuestionGenerationInput,
): string => {
  switch (input.requestedQuestionType) {
    case 'SELECT_MEANING':
      return 'Use the clear form Which Vietnamese meaning best matches "wordOrPhrase" in "short exact source clause"? Start with Which Vietnamese meaning, and use the shortest exact clause from originalSentence that contains wordOrPhrase. Do not paraphrase the source or turn the task into a question about what happened, what someone did, or what someone endured.';
    case 'SELECT_WORD':
      return 'Give one short concrete cue based on contextualMeaningVi and partOfSpeech, then explicitly ask: Which English word or phrase fits? Do not include wordOrPhrase in the prompt.';
    case 'SELECT_CORRECT_CONTEXT':
      return 'Explicitly ask: Which sentence uses "wordOrPhrase" with the same meaning? Include wordOrPhrase but do not copy originalSentence into the prompt.';
    case 'FILL_BLANK':
      return 'Use the clear prompt Complete the sentence with your saved word or phrase. Let blankSentence provide enough semantic or collocational evidence; do not include wordOrPhrase in the prompt or outside the blank.';
  }
};

const promptDescription = (input: ReviewQuestionGenerationInput): string =>
  [
    `One immediately understandable learner-facing task in one or two short sentences, no harder than ${input.targetCefr}.`,
    `Follow promptStyle ${input.promptStyle}.`,
    promptStyleGuidance(input.promptStyle),
    questionTypePromptGuidance(input),
    'The question-type wording and grammatical answer kind are mandatory and take priority over stylistic variety.',
    'Use only the shortest context needed for one unambiguous choice; do not retell the source or stack clauses.',
    'Do not name the style or add decorative game-like language.',
    'Do not use raw Markdown.',
    'Do not use generic What is/does ... mean/meaning wording, based on the clue, strong contextual clue, which term fits this action, in the supplied usage, or provided context.',
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
          ? 'One fresh, natural target-level message, thought, or situation with decisive semantic or collocational evidence, exactly one ___ blank, and no other copy of wordOrPhrase.'
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
          : 'Two or three distinct plain-text incorrect options parallel to the authoritative answer in language, answer kind, grammatical role, and approximate detail. Each must reflect a believable confusion without being absurd or broken. Never include or paraphrase the authoritative correct answer.',
      items: requiredString(
        'One distinct, plausible, parallel, but clearly incorrect option.',
      ),
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
          'One immediately understandable plain-text task in one or two short sentences. For SELECT_MEANING, start with Which Vietnamese meaning and include wordOrPhrase; for SELECT_WORD, include Which English word or phrase; for SELECT_CORRECT_CONTEXT, start with Which sentence and include wordOrPhrase; for FILL_BLANK, start with Complete the sentence with your saved word or phrase. requestedQuestionType determines the grammatical answer kind, while promptStyle may shape only the shortest supporting cue. Do not name the style, retell the source, add decorative game-like language, or reveal the matching correct answer.',
        ),
        blankSentence: {
          type: ['string', 'null'],
          description:
            'For FILL_BLANK, one fresh concrete sentence with decisive semantic or collocational evidence and exactly one ___ blank; otherwise null.',
        },
        answerExplanation: requiredString(
          'Exactly two or three short plain-text sentences explaining the correct answer.',
        ),
        distractors: {
          type: 'array',
          maxItems: 3,
          description:
            'For an option question, two or three distinct, plausible, parallel but incorrect options that reflect believable confusion; for FILL_BLANK, empty. Never return the authoritative correct answer.',
          items: requiredString(
            'One distinct, plausible, parallel, but clearly incorrect option.',
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
