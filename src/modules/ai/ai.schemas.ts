import {
  CEFR_LEVELS,
  LEXICAL_UNIT_TYPES,
  type ArticleAnalysisInput,
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
