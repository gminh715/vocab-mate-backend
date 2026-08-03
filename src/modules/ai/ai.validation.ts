import type { AiConfig } from '../../config/ai.config';
import {
  CEFR_LEVELS,
  LEXICAL_UNIT_TYPES,
  REVIEW_QUESTION_TYPES,
  type ArticleAnalysisInput,
  type ArticleAnalysisResult,
  type ArticleAnalysisTerm,
  type TermEnrichmentInput,
  type TermEnrichmentResult,
  type TermExample,
  type ReviewQuestionGenerationInput,
  type ReviewQuestionGenerationOption,
  type ReviewQuestionGenerationResult,
} from './ai.contracts';
import { AiError, ProviderCallError } from './ai.errors';

export const AI_OUTPUT_LIMITS = {
  summary: 1000,
  termText: 200,
  partOfSpeech: 100,
  selectionReason: 500,
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

export const validateArticleAnalysisInput = (
  input: ArticleAnalysisInput,
  config: AiConfig,
): void => {
  const value = recordValue(
    input,
    'article',
    [
      'articleId',
      'title',
      'articleText',
      'contentVersion',
      'sentences',
      'allowedCategories',
      'maxTermCount',
    ],
    'input',
  );

  stringValue(value.articleId, 'articleId', 128, 'input');
  stringValue(value.title, 'title', 500, 'input');
  stringValue(
    value.articleText,
    'articleText',
    config.maxArticleCharacters,
    'input',
  );
  positiveIntegerValue(
    value.contentVersion,
    'contentVersion',
    Number.MAX_SAFE_INTEGER,
  );
  positiveIntegerValue(
    value.maxTermCount,
    'maxTermCount',
    config.maxTermsPerArticle,
  );

  const sentences = arrayValue(value.sentences, 'sentences', 2000, 'input');
  if (sentences.length === 0) {
    fail('input', 'sentences');
  }
  const sentenceIds = new Set<string>();
  let totalSentenceCharacters = 0;
  for (const [index, sentence] of sentences.entries()) {
    const item = recordValue(
      sentence,
      `sentences[${index}]`,
      ['sentenceId', 'sentenceText'],
      'input',
    );
    const sentenceId = stringValue(
      item.sentenceId,
      `sentences[${index}].sentenceId`,
      128,
      'input',
    );
    const sentenceText = stringValue(
      item.sentenceText,
      `sentences[${index}].sentenceText`,
      10000,
      'input',
    );
    totalSentenceCharacters += sentenceText.length;
    if (totalSentenceCharacters > config.maxArticleCharacters) {
      fail('input', 'sentences');
    }
    if (sentenceIds.has(sentenceId)) {
      fail('input', 'sentences.sentenceId');
    }
    sentenceIds.add(sentenceId);
  }

  const categories = arrayValue(
    value.allowedCategories,
    'allowedCategories',
    100,
    'input',
  );
  if (categories.length === 0) {
    fail('input', 'allowedCategories');
  }
  const categoryIds = new Set<string>();
  const categorySlugs = new Set<string>();
  for (const [index, category] of categories.entries()) {
    const item = recordValue(
      category,
      `allowedCategories[${index}]`,
      ['id', 'slug', 'name'],
      'input',
    );
    const id = stringValue(
      item.id,
      `allowedCategories[${index}].id`,
      128,
      'input',
    );
    const slug = stringValue(
      item.slug,
      `allowedCategories[${index}].slug`,
      100,
      'input',
    );
    stringValue(item.name, `allowedCategories[${index}].name`, 200, 'input');
    if (categoryIds.has(id) || categorySlugs.has(slug)) {
      fail('input', 'allowedCategories');
    }
    categoryIds.add(id);
    categorySlugs.add(slug);
  }
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
};

const parseArticleTerm = (
  value: unknown,
  index: number,
): ArticleAnalysisTerm => {
  const term = recordValue(
    value,
    `terms[${index}]`,
    [
      'sentenceId',
      'value',
      'wordDisplay',
      'lemma',
      'normalizedLemma',
      'unitType',
      'partOfSpeech',
      'cefrLevel',
      'selectionReason',
    ],
    'output',
  );

  return {
    sentenceId: stringValue(
      term.sentenceId,
      `terms[${index}].sentenceId`,
      128,
      'output',
    ),
    value: stringValue(
      term.value,
      `terms[${index}].value`,
      AI_OUTPUT_LIMITS.termText,
      'output',
    ),
    wordDisplay: stringValue(
      term.wordDisplay,
      `terms[${index}].wordDisplay`,
      AI_OUTPUT_LIMITS.termText,
      'output',
    ),
    lemma: stringValue(
      term.lemma,
      `terms[${index}].lemma`,
      AI_OUTPUT_LIMITS.termText,
      'output',
    ),
    normalizedLemma: stringValue(
      term.normalizedLemma,
      `terms[${index}].normalizedLemma`,
      AI_OUTPUT_LIMITS.termText,
      'output',
    ),
    unitType: enumValue(
      term.unitType,
      `terms[${index}].unitType`,
      LEXICAL_UNIT_TYPES,
      'output',
    ),
    partOfSpeech: stringValue(
      term.partOfSpeech,
      `terms[${index}].partOfSpeech`,
      AI_OUTPUT_LIMITS.partOfSpeech,
      'output',
    ),
    cefrLevel: enumValue(
      term.cefrLevel,
      `terms[${index}].cefrLevel`,
      CEFR_LEVELS,
      'output',
    ),
    selectionReason: stringValue(
      term.selectionReason,
      `terms[${index}].selectionReason`,
      AI_OUTPUT_LIMITS.selectionReason,
      'output',
    ),
  };
};

export const parseArticleAnalysisResult = (
  raw: unknown,
  input: ArticleAnalysisInput,
): ArticleAnalysisResult => {
  const result = recordValue(
    raw,
    'result',
    ['summaryEn', 'cefrLevel', 'categorySlug', 'terms'],
    'output',
  );
  const parsedTerms = arrayValue(
    result.terms,
    'terms',
    input.maxTermCount * 2,
    'output',
  )
    .slice(0, input.maxTermCount)
    .map(parseArticleTerm);

  const sentences = new Map(
    input.sentences.map(({ sentenceId, sentenceText }, index) => [
      sentenceId,
      { sentenceText, index },
    ]),
  );
  const terms = parsedTerms
    .flatMap((term) => {
      const sentence = sentences.get(term.sentenceId);
      if (!sentence) {
        return fail('output', 'terms');
      }
      if (sentence.sentenceText.includes(term.value)) {
        return [term];
      }

      const normalizedSentence =
        sentence.sentenceText.toLocaleLowerCase('en-US');
      const normalizedValue = term.value.toLocaleLowerCase('en-US');
      const start = normalizedSentence.indexOf(normalizedValue);
      if (
        start < 0 ||
        normalizedSentence.indexOf(normalizedValue, start + 1) >= 0
      ) {
        return [];
      }

      return [
        {
          ...term,
          value: sentence.sentenceText.slice(start, start + term.value.length),
        },
      ];
    })
    .sort(
      (left, right) =>
        Number(sentences.get(left.sentenceId)?.index) -
        Number(sentences.get(right.sentenceId)?.index),
    );
  const candidates = new Set<string>();
  const uniqueTerms: ArticleAnalysisTerm[] = [];

  for (const term of terms) {
    const sentence = sentences.get(term.sentenceId);
    if (sentence) {
      if (!sentence.sentenceText.includes(term.value)) {
        fail('output', 'terms');
      }

      const candidateKey = `${term.sentenceId}\u0000${term.value}`;
      if (candidates.has(candidateKey)) {
        continue;
      }
      candidates.add(candidateKey);
      uniqueTerms.push(term);
      continue;
    }

    fail('output', 'terms');
  }

  const categorySlug = stringValue(
    result.categorySlug,
    'categorySlug',
    100,
    'output',
  );
  if (!input.allowedCategories.some(({ slug }) => slug === categorySlug)) {
    fail('output', 'categorySlug');
  }

  return {
    summaryEn: stringValue(
      result.summaryEn,
      'summaryEn',
      AI_OUTPUT_LIMITS.summary,
      'output',
    ),
    cefrLevel: enumValue(result.cefrLevel, 'cefrLevel', CEFR_LEVELS, 'output'),
    categorySlug,
    terms: uniqueTerms,
  };
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
      options.length !== 0
    ) {
      fail('output', 'fillBlank');
    }
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

export const parseProviderJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    throw new ProviderCallError('unusable-output');
  }
};
