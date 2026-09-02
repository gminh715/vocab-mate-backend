import {
  CEFR_LEVELS,
  type TermEnrichmentInput,
  type TermEnrichmentResult,
  type TermExample,
} from '../ai.contracts';
import { AiError, ProviderCallError } from '../ai.errors';

export const TERM_ENRICHMENT_OUTPUT_LIMITS = {
  termText: 200,
  partOfSpeech: 100,
  enrichmentText: 2000,
  contextualMeaningWords: 6,
  ipa: 100,
  listItems: 8,
  listItemText: 200,
  examples: 2,
  exampleSentence: 500,
  exampleTranslation: 1000,
  sentenceTranslation: 5000,
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
  if (!isRecord(value)) return fail(boundary, field);

  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(boundary, field);
  }
  return value;
};

const stringValue = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): string => {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum
  ) {
    return fail(boundary, field);
  }
  return value;
};

const nullableStringValue = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): string | null =>
  value === null ? null : stringValue(value, field, maximum, boundary);

const enumValue = <T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
  boundary: ValidationBoundary,
): T[number] => {
  if (typeof value === 'string') {
    const matched = allowed.find((item) => item === value);
    if (matched !== undefined) return matched;
  }
  return fail(boundary, field);
};

const arrayValue = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): unknown[] => {
  if (!Array.isArray(value) || value.length > maximum) {
    return fail(boundary, field);
  }
  return value;
};

const stringArrayValue = (value: unknown, field: string): string[] => {
  const strings = arrayValue(
    value,
    field,
    TERM_ENRICHMENT_OUTPUT_LIMITS.listItems,
    'output',
  ).map((item, index) =>
    stringValue(
      item,
      `${field}[${index}]`,
      TERM_ENRICHMENT_OUTPUT_LIMITS.listItemText,
      'output',
    ),
  );
  const unique = new Set(
    strings.map((item) => item.trim().toLocaleLowerCase('en-US')),
  );
  if (unique.size !== strings.length) fail('output', field);
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
  if (!sentence.includes(surfaceValue)) fail('input', 'value');
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
      TERM_ENRICHMENT_OUTPUT_LIMITS.exampleSentence,
      'output',
    ),
    translationVi: stringValue(
      example.translationVi,
      `examples[${index}].translationVi`,
      TERM_ENRICHMENT_OUTPUT_LIMITS.exampleTranslation,
      'output',
    ),
  };
};

export const parseTermEnrichmentResult = (
  raw: unknown,
): TermEnrichmentResult => {
  const result = recordValue(
    raw,
    'result',
    [
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
      'examples',
      'sentenceTranslationVi',
    ],
    'output',
  );
  const examples = arrayValue(
    result.examples,
    'examples',
    TERM_ENRICHMENT_OUTPUT_LIMITS.examples,
    'output',
  ).map(parseExample);
  const uniqueExamples = new Set(
    examples.map(({ sentence }) => sentence.trim().toLocaleLowerCase('en-US')),
  );
  if (uniqueExamples.size !== examples.length) fail('output', 'examples');

  const contextualMeaningVi = stringValue(
    result.contextualMeaningVi,
    'contextualMeaningVi',
    TERM_ENRICHMENT_OUTPUT_LIMITS.enrichmentText,
    'output',
  );
  if (
    contextualMeaningVi.includes(',') ||
    contextualMeaningVi.trim().split(/\s+/u).length >
      TERM_ENRICHMENT_OUTPUT_LIMITS.contextualMeaningWords
  ) {
    fail('output', 'contextualMeaningVi');
  }

  return {
    partOfSpeech: stringValue(
      result.partOfSpeech,
      'partOfSpeech',
      TERM_ENRICHMENT_OUTPUT_LIMITS.partOfSpeech,
      'output',
    ).toLocaleLowerCase('en-US'),
    cefrLevel: enumValue(result.cefrLevel, 'cefrLevel', CEFR_LEVELS, 'output'),
    contextualMeaningVi,
    definitionEn: stringValue(
      result.definitionEn,
      'definitionEn',
      TERM_ENRICHMENT_OUTPUT_LIMITS.enrichmentText,
      'output',
    ),
    contextualExplanation: stringValue(
      result.contextualExplanation,
      'contextualExplanation',
      TERM_ENRICHMENT_OUTPUT_LIMITS.enrichmentText,
      'output',
    ),
    ipa: nullableStringValue(
      result.ipa,
      'ipa',
      TERM_ENRICHMENT_OUTPUT_LIMITS.ipa,
      'output',
    ),
    synonyms: stringArrayValue(result.synonyms, 'synonyms'),
    antonyms: stringArrayValue(result.antonyms, 'antonyms'),
    collocations: stringArrayValue(result.collocations, 'collocations'),
    relatedTerms: stringArrayValue(result.relatedTerms, 'relatedTerms'),
    examples,
    sentenceTranslationVi: stringValue(
      result.sentenceTranslationVi,
      'sentenceTranslationVi',
      TERM_ENRICHMENT_OUTPUT_LIMITS.sentenceTranslation,
      'output',
    ),
  };
};
