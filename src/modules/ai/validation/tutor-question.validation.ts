import {
  type BaseTutorQuestionResult,
  type McOption,
  OPTION_IDS,
  RETEST_TYPES,
  TUTOR_QUESTION_TYPES,
  type TutorQuestionInput,
  type TutorQuestionResult,
  type TutorQuestionType,
} from '../ai.contracts';
import { AiError, ProviderCallError } from '../ai.errors';

export const TUTOR_QUESTION_LIMITS = {
  candidateList: 50,
  allowlist: 50,
  id: 128,
  wordDisplay: 200,
  lemma: 200,
  partOfSpeech: 100,
  meaningVi: 500,
  questionPromptVi: 500,
  explanationVi: 1000,
  feedbackVi: 500,
  optionText: 300,
  sentenceWithBlank: 1000,
  recallPromptVi: 500,
  microLessonTitle: 300,
  microLessonFactEn: 1500,
  microLessonFactVi: 1500,
  microLessonVi: 2000,
  canonicalAnswer: 200,
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

const optionalStringValue = (
  value: unknown,
  field: string,
  maximum: number,
  boundary: ValidationBoundary,
): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  return stringValue(value, field, maximum, boundary);
};

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

export const validateTutorQuestionInput = (input: TutorQuestionInput): void => {
  const value = recordValue(
    input,
    'input',
    ['allowlistIds', 'candidates', 'questionType'],
    'input',
  );

  const allowlist = arrayValue(
    value.allowlistIds,
    'allowlistIds',
    TUTOR_QUESTION_LIMITS.allowlist,
    'input',
  );
  if (allowlist.length === 0) fail('input', 'allowlistIds');
  const allowlistStrings = allowlist.map((id, index) =>
    stringValue(
      id,
      `allowlistIds[${index}]`,
      TUTOR_QUESTION_LIMITS.id,
      'input',
    ),
  );
  const allowlistSet = new Set(allowlistStrings);

  enumValue(value.questionType, 'questionType', TUTOR_QUESTION_TYPES, 'input');

  const candidates = arrayValue(
    value.candidates,
    'candidates',
    TUTOR_QUESTION_LIMITS.candidateList,
    'input',
  );
  if (candidates.length === 0) fail('input', 'candidates');

  candidates.forEach((cand, index) => {
    const candObj = recordValue(
      cand,
      `candidates[${index}]`,
      ['id', 'wordDisplay', 'lemma', 'partOfSpeech', 'meaningVi', 'examples'],
      'input',
    );
    const id = stringValue(
      candObj.id,
      `candidates[${index}].id`,
      TUTOR_QUESTION_LIMITS.id,
      'input',
    );
    if (!allowlistSet.has(id)) {
      fail('input', `candidates[${index}].id`);
    }
    stringValue(
      candObj.wordDisplay,
      `candidates[${index}].wordDisplay`,
      TUTOR_QUESTION_LIMITS.wordDisplay,
      'input',
    );
    stringValue(
      candObj.lemma,
      `candidates[${index}].lemma`,
      TUTOR_QUESTION_LIMITS.lemma,
      'input',
    );
    stringValue(
      candObj.partOfSpeech,
      `candidates[${index}].partOfSpeech`,
      TUTOR_QUESTION_LIMITS.partOfSpeech,
      'input',
    );
    stringValue(
      candObj.meaningVi,
      `candidates[${index}].meaningVi`,
      TUTOR_QUESTION_LIMITS.meaningVi,
      'input',
    );
  });
};

export const parseTutorQuestionResult = (
  raw: unknown,
  allowlistIds: string[],
  expectedQuestionType: TutorQuestionType,
): TutorQuestionResult => {
  const result = recordValue(
    raw,
    'result',
    [
      'selectedCandidateId',
      'questionType',
      'questionPromptVi',
      'explanationVi',
      'feedbackCorrectVi',
      'feedbackIncorrectVi',
      'options',
      'correctOptionId',
      'sentenceWithBlank',
      'recallPromptVi',
      'microLessonTitle',
      'microLessonFactEn',
      'microLessonFactVi',
      'microLessonVi',
      'retestType',
      'canonicalAnswer',
    ],
    'output',
  );

  const selectedCandidateId = stringValue(
    result.selectedCandidateId,
    'selectedCandidateId',
    TUTOR_QUESTION_LIMITS.id,
    'output',
  );
  if (!allowlistIds.includes(selectedCandidateId)) {
    fail('output', 'selectedCandidateId');
  }

  const questionType = enumValue(
    result.questionType,
    'questionType',
    TUTOR_QUESTION_TYPES,
    'output',
  );
  if (questionType !== expectedQuestionType) {
    fail('output', 'questionType');
  }

  const questionPromptVi = stringValue(
    result.questionPromptVi,
    'questionPromptVi',
    TUTOR_QUESTION_LIMITS.questionPromptVi,
    'output',
  );
  const explanationVi = stringValue(
    result.explanationVi,
    'explanationVi',
    TUTOR_QUESTION_LIMITS.explanationVi,
    'output',
  );
  const feedbackCorrectVi = stringValue(
    result.feedbackCorrectVi,
    'feedbackCorrectVi',
    TUTOR_QUESTION_LIMITS.feedbackVi,
    'output',
  );
  const feedbackIncorrectVi = stringValue(
    result.feedbackIncorrectVi,
    'feedbackIncorrectVi',
    TUTOR_QUESTION_LIMITS.feedbackVi,
    'output',
  );

  const baseResult: BaseTutorQuestionResult = {
    selectedCandidateId,
    questionType,
    questionPromptVi,
    explanationVi,
    feedbackCorrectVi,
    feedbackIncorrectVi,
  };

  switch (questionType) {
    case 'MULTIPLE_CHOICE': {
      if (!Array.isArray(result.options) || result.options.length !== 4) {
        fail('output', 'options');
      }
      const rawOptions = result.options as unknown[];
      const parsedOptions: McOption[] = rawOptions.map((opt, index) => {
        const optObj = recordValue(
          opt,
          `options[${index}]`,
          ['id', 'text'],
          'output',
        );
        const id = enumValue(
          optObj.id,
          `options[${index}].id`,
          OPTION_IDS,
          'output',
        );
        const text = stringValue(
          optObj.text,
          `options[${index}].text`,
          TUTOR_QUESTION_LIMITS.optionText,
          'output',
        );
        return { id, text };
      });

      const optionIdSet = new Set(parsedOptions.map((o) => o.id));
      if (
        optionIdSet.size !== 4 ||
        !OPTION_IDS.every((id) => optionIdSet.has(id))
      ) {
        fail('output', 'options.ids');
      }

      const correctOptionId = enumValue(
        result.correctOptionId,
        'correctOptionId',
        OPTION_IDS,
        'output',
      );

      return {
        ...baseResult,
        questionType: 'MULTIPLE_CHOICE',
        options: parsedOptions as [McOption, McOption, McOption, McOption],
        correctOptionId,
      };
    }

    case 'CONTEXTUAL_CLOZE': {
      const sentenceWithBlank = stringValue(
        result.sentenceWithBlank,
        'sentenceWithBlank',
        TUTOR_QUESTION_LIMITS.sentenceWithBlank,
        'output',
      );
      if (!sentenceWithBlank.includes('___')) {
        fail('output', 'sentenceWithBlank');
      }
      const canonicalAnswer = stringValue(
        result.canonicalAnswer,
        'canonicalAnswer',
        TUTOR_QUESTION_LIMITS.canonicalAnswer,
        'output',
      );

      return {
        ...baseResult,
        questionType: 'CONTEXTUAL_CLOZE',
        sentenceWithBlank,
        canonicalAnswer,
      };
    }

    case 'TYPED_RECALL': {
      const recallPromptVi = stringValue(
        result.recallPromptVi,
        'recallPromptVi',
        TUTOR_QUESTION_LIMITS.recallPromptVi,
        'output',
      );
      const canonicalAnswer = stringValue(
        result.canonicalAnswer,
        'canonicalAnswer',
        TUTOR_QUESTION_LIMITS.canonicalAnswer,
        'output',
      );

      return {
        ...baseResult,
        questionType: 'TYPED_RECALL',
        recallPromptVi,
        canonicalAnswer,
      };
    }

    case 'MICRO_LESSON_RETEST': {
      const microLessonTitle = optionalStringValue(
        result.microLessonTitle,
        'microLessonTitle',
        TUTOR_QUESTION_LIMITS.microLessonTitle,
        'output',
      );
      const microLessonFactEn = optionalStringValue(
        result.microLessonFactEn,
        'microLessonFactEn',
        TUTOR_QUESTION_LIMITS.microLessonFactEn,
        'output',
      );
      const microLessonFactVi = optionalStringValue(
        result.microLessonFactVi,
        'microLessonFactVi',
        TUTOR_QUESTION_LIMITS.microLessonFactVi,
        'output',
      );

      let microLessonVi: string;
      if (
        typeof result.microLessonVi === 'string' &&
        result.microLessonVi.trim().length > 0
      ) {
        microLessonVi = stringValue(
          result.microLessonVi,
          'microLessonVi',
          TUTOR_QUESTION_LIMITS.microLessonVi,
          'output',
        );
      } else if (microLessonFactVi) {
        microLessonVi = microLessonFactVi;
      } else {
        microLessonVi = stringValue(
          result.microLessonVi,
          'microLessonVi',
          TUTOR_QUESTION_LIMITS.microLessonVi,
          'output',
        );
      }

      const retestType = enumValue(
        result.retestType,
        'retestType',
        RETEST_TYPES,
        'output',
      );
      const canonicalAnswer = stringValue(
        result.canonicalAnswer,
        'canonicalAnswer',
        TUTOR_QUESTION_LIMITS.canonicalAnswer,
        'output',
      );

      if (retestType === 'CONTEXTUAL_CLOZE') {
        const sentenceWithBlank = stringValue(
          result.sentenceWithBlank,
          'sentenceWithBlank',
          TUTOR_QUESTION_LIMITS.sentenceWithBlank,
          'output',
        );
        if (!sentenceWithBlank.includes('___')) {
          fail('output', 'sentenceWithBlank');
        }
        return {
          ...baseResult,
          questionType: 'MICRO_LESSON_RETEST',
          microLessonTitle,
          microLessonFactEn,
          microLessonFactVi,
          microLessonVi,
          retestType: 'CONTEXTUAL_CLOZE',
          sentenceWithBlank,
          canonicalAnswer,
        };
      }

      const recallPromptVi = stringValue(
        result.recallPromptVi,
        'recallPromptVi',
        TUTOR_QUESTION_LIMITS.recallPromptVi,
        'output',
      );
      return {
        ...baseResult,
        questionType: 'MICRO_LESSON_RETEST',
        microLessonTitle,
        microLessonFactEn,
        microLessonFactVi,
        microLessonVi,
        retestType: 'TYPED_RECALL',
        recallPromptVi,
        canonicalAnswer,
      };
    }
  }
};
