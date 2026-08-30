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
    'One concise Vietnamese meaning in this exact sentence context.',
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
  microLessonVi: nullableString(
    'A concise lesson (<150 words) in Vietnamese for MICRO_LESSON_RETEST, or null.',
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
