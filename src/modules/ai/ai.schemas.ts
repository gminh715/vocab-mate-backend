import {
  CEFR_LEVELS,
  OPTION_IDS,
  RETEST_TYPES,
  TUTOR_QUESTION_TYPES,
} from './ai.contracts';

type JsonSchema = Record<string, unknown>;

const requiredString = (description: string): JsonSchema => ({
  type: 'string',
  description,
});

const nullableString = (description: string): JsonSchema => ({
  type: ['string', 'null'],
  description,
});

const strictObject = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const boundedStringArray = (description: string): JsonSchema => ({
  type: 'array',
  maxItems: 8,
  description,
  items: { type: 'string' },
});

export const termEnrichmentSchema: JsonSchema = strictObject({
  partOfSpeech: requiredString('Part of speech in this sentence context.'),
  cefrLevel: {
    type: 'string',
    enum: CEFR_LEVELS,
    description: 'CEFR difficulty of this contextual term.',
  },
  contextualMeaningVi: requiredString(
    'One concise Vietnamese meaning in this exact sentence context (strictly 1 to 6 words, without commas).',
  ),
  definitionEn: requiredString('A concise English definition.'),
  contextualExplanation: requiredString(
    'A concise explanation of how the term works in this context.',
  ),
  ipa: { type: ['string', 'null'], description: 'IPA pronunciation.' },
  synonyms: boundedStringArray('Contextually relevant synonyms.'),
  antonyms: boundedStringArray('Contextually relevant antonyms.'),
  collocations: boundedStringArray('Useful collocations.'),
  relatedTerms: boundedStringArray('Closely related vocabulary.'),
  examples: {
    type: 'array',
    maxItems: 2,
    items: strictObject({
      sentence: requiredString('A natural English example sentence.'),
      translationVi: requiredString('Vietnamese translation of the example.'),
    }),
  },
  sentenceTranslationVi: requiredString(
    'Vietnamese translation of the supplied parent sentence.',
  ),
});

export const tutorQuestionSchema: JsonSchema = strictObject({
  selectedCandidateId: requiredString(
    'The ID of the chosen vocabulary candidate from the provided candidates list.',
  ),
  questionType: {
    type: 'string',
    enum: TUTOR_QUESTION_TYPES,
    description: 'Question type for this tutor activity.',
  },
  questionPromptVi: requiredString(
    'Instruction or question prompt displayed to the learner in Vietnamese.',
  ),
  explanationVi: requiredString(
    'Detailed explanation in Vietnamese of the vocabulary item and correct answer.',
  ),
  feedbackCorrectVi: requiredString(
    'Short encouraging feedback in Vietnamese when learner answers correctly.',
  ),
  feedbackIncorrectVi: requiredString(
    'Short constructive feedback in Vietnamese when learner answers incorrectly.',
  ),
  options: {
    type: 'array',
    maxItems: 4,
    items: strictObject({
      id: {
        type: 'string',
        enum: OPTION_IDS,
        description: 'Option identifier (A, B, C, D).',
      },
      text: requiredString('Option text.'),
    }),
    description:
      'Exactly 4 options for MULTIPLE_CHOICE, or empty array if not applicable.',
  },
  correctOptionId: {
    type: ['string', 'null'],
    enum: [...OPTION_IDS, null],
    description:
      'The correct option ID (A, B, C, D) for MULTIPLE_CHOICE, or null if not applicable.',
  },
  sentenceWithBlank: nullableString(
    'The English sentence containing "___" for CONTEXTUAL_CLOZE or cloze retest, or null.',
  ),
  recallPromptVi: nullableString(
    'Prompt in Vietnamese asking for recall of the English word for TYPED_RECALL or recall retest, or null.',
  ),
  microLessonTitle: nullableString(
    'A short catchy title in English or Vietnamese for the interesting fact in MICRO_LESSON_RETEST, or null.',
  ),
  microLessonFactEn: nullableString(
    'A 2-4 sentence interesting fact reading passage in English (<80 words) naturally embedding the target vocabulary word for MICRO_LESSON_RETEST, or null.',
  ),
  microLessonFactVi: nullableString(
    'Natural Vietnamese translation of the fact reading passage for MICRO_LESSON_RETEST, or null.',
  ),
  microLessonVi: nullableString(
    'A concise lesson/summary (<150 words) in Vietnamese for MICRO_LESSON_RETEST, or null.',
  ),
  retestType: {
    type: ['string', 'null'],
    enum: [...RETEST_TYPES, null],
    description:
      'Question type for the retest in MICRO_LESSON_RETEST, or null.',
  },
  canonicalAnswer: nullableString(
    'The exact canonical answer string for cloze, typed recall, or retest, or null.',
  ),
});

export const sessionWarmupSchema = strictObject({
  facts: {
    type: 'array',
    description:
      'List of 1 to 3 intriguing real-world fact stories in natural Vietnamese embedding the target vocabulary words.',
    items: strictObject({
      title: {
        type: 'string',
        description: 'An intriguing 3 to 7 word title in Vietnamese.',
      },
      factContentVi: {
        type: 'string',
        description:
          'A fascinating real-world fact/trivia passage (40-100 words) in natural Vietnamese, embedding the English words in bold markdown followed by parentheses: "**word** (nghĩa tiếng Việt)".',
      },
      targetWords: {
        type: 'array',
        description: 'The English vocabulary words woven into this fact story.',
        items: { type: 'string' },
      },
    }),
  },
});
