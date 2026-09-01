import type {
  MultipleChoiceResult,
  ContextualClozeResult,
  TypedRecallResult,
  MicroLessonRetestResult,
  TutorQuestionInput,
} from '../../../../src/modules/ai/ai.contracts';
import {
  parseTutorQuestionResult,
  validateTutorQuestionInput,
} from '../../../../src/modules/ai/validation/tutor-question.validation';

const sampleInput: TutorQuestionInput = {
  allowlistIds: ['vocab-1', 'vocab-2'],
  questionType: 'MULTIPLE_CHOICE',
  candidates: [
    {
      id: 'vocab-1',
      wordDisplay: 'ambitious',
      lemma: 'ambitious',
      partOfSpeech: 'adjective',
      meaningVi: 'đầy tham vọng',
      examples: [
        {
          sentence: 'An ambitious plan.',
          translationVi: 'Kế hoạch đầy tham vọng.',
        },
      ],
    },
    {
      id: 'vocab-2',
      wordDisplay: 'resilient',
      lemma: 'resilient',
      partOfSpeech: 'adjective',
      meaningVi: 'kiên cường',
      examples: [],
    },
  ],
};

const sampleMcResult = {
  selectedCandidateId: 'vocab-1',
  questionType: 'MULTIPLE_CHOICE',
  questionPromptVi: 'Chọn từ tiếng Anh có nghĩa là "đầy tham vọng":',
  explanationVi: '"Ambitious" có nghĩa là đầy tham vọng.',
  feedbackCorrectVi: 'Chính xác! Bạn nhớ từ rất tốt.',
  feedbackIncorrectVi: 'Chưa đúng, đáp án chính xác là "ambitious".',
  options: [
    { id: 'A', text: 'ambitious' },
    { id: 'B', text: 'resilient' },
    { id: 'C', text: 'hesitant' },
    { id: 'D', text: 'cautious' },
  ],
  correctOptionId: 'A',
  sentenceWithBlank: null,
  recallPromptVi: null,
  microLessonTitle: null,
  microLessonFactEn: null,
  microLessonFactVi: null,
  microLessonVi: null,
  retestType: null,
  canonicalAnswer: null,
};

const sampleClozeResult = {
  selectedCandidateId: 'vocab-1',
  questionType: 'CONTEXTUAL_CLOZE',
  questionPromptVi: 'Điền từ thích hợp vào chỗ trống:',
  explanationVi: '"Ambitious" là tính từ phù hợp với ngữ cảnh.',
  feedbackCorrectVi: 'Rất tốt! Bạn điền đúng từ.',
  feedbackIncorrectVi: 'Chưa chính xác. Từ cần điền là "ambitious".',
  options: [],
  correctOptionId: null,
  sentenceWithBlank: 'They launched an ___ project to rebuild the city.',
  recallPromptVi: null,
  microLessonTitle: null,
  microLessonFactEn: null,
  microLessonFactVi: null,
  microLessonVi: null,
  retestType: null,
  canonicalAnswer: 'ambitious',
};

const sampleTypedRecallResult = {
  selectedCandidateId: 'vocab-1',
  questionType: 'TYPED_RECALL',
  questionPromptVi: 'Gõ từ tiếng Anh có nghĩa là:',
  explanationVi: '"Ambitious" có nghĩa là đầy tham vọng.',
  feedbackCorrectVi: 'Chính xác hoàn toàn!',
  feedbackIncorrectVi: 'Đáp án đúng là "ambitious".',
  options: [],
  correctOptionId: null,
  sentenceWithBlank: null,
  recallPromptVi: 'đầy tham vọng (tính từ, bắt đầu bằng a)',
  microLessonTitle: null,
  microLessonFactEn: null,
  microLessonFactVi: null,
  microLessonVi: null,
  retestType: null,
  canonicalAnswer: 'ambitious',
};

const sampleMicroLessonClozeResult = {
  selectedCandidateId: 'vocab-1',
  questionType: 'MICRO_LESSON_RETEST',
  questionPromptVi: 'Đọc bài học ngắn sau và hoàn thành câu hỏi:',
  explanationVi: 'Nhớ rằng "ambitious" đi với plan/project.',
  feedbackCorrectVi: 'Tuyệt vời, bạn đã nắm vững bài học!',
  feedbackIncorrectVi: 'Hãy xem lại bài học phía trên nhé.',
  options: [],
  correctOptionId: null,
  sentenceWithBlank: 'The mayor announced an ___ plan.',
  recallPromptVi: null,
  microLessonTitle: 'Tháp Eiffel vào mùa hè',
  microLessonFactEn:
    'During summer heat, thermal expansion makes the Eiffel Tower grow by up to 15 centimeters. Engineers created ambitious designs to handle such temperature swings.',
  microLessonFactVi:
    'Vào mùa hè, hiện tượng giãn nở nhiệt khiến tháp Eiffel cao thêm tới 15 cm. Các kỹ sư đã tạo ra những thiết kế **ambitious** (đầy tham vọng) để thích ứng với sự thay đổi nhiệt độ này.',
  microLessonVi:
    '"Ambitious" (adj) dùng để miêu tả kế hoạch lớn hoặc người có chí tiến thủ cao.',
  retestType: 'CONTEXTUAL_CLOZE',
  canonicalAnswer: 'ambitious',
};

const sampleMicroLessonRecallResult = {
  selectedCandidateId: 'vocab-1',
  questionType: 'MICRO_LESSON_RETEST',
  questionPromptVi: 'Đọc bài học ngắn sau và trả lời câu hỏi:',
  explanationVi: '"Ambitious" là từ cần ghi nhớ.',
  feedbackCorrectVi: 'Chính xác!',
  feedbackIncorrectVi: 'Từ đúng là "ambitious".',
  options: [],
  correctOptionId: null,
  sentenceWithBlank: null,
  recallPromptVi: 'Từ tiếng Anh miêu tả người hoặc kế hoạch đầy tham vọng:',
  microLessonTitle: 'Mật ong không bao giờ thiu',
  microLessonFactEn:
    'Archaeologists found 3000-year-old honey in Egyptian tombs that is still edible. Preserving food for millennia was once an ambitious dream.',
  microLessonFactVi:
    'Mật ong tự nhiên không bao giờ bị ôi thiu; các nhà khảo cổ từng khai quật những hũ mật ong hơn 3.000 năm tuổi trong lăng mộ Ai Cập cổ đại mà chất lượng vẫn hoàn toàn **edible** (có thể ăn được).',
  microLessonVi: '"Ambitious" đi với danh từ chỉ dự án hoặc mục tiêu lớn.',
  retestType: 'TYPED_RECALL',
  canonicalAnswer: 'ambitious',
};

describe('tutor-question.validation', () => {
  describe('validateTutorQuestionInput', () => {
    it('validates a correct input successfully', () => {
      expect(() => validateTutorQuestionInput(sampleInput)).not.toThrow();
    });

    it('rejects input with empty allowlistIds', () => {
      expect(() =>
        validateTutorQuestionInput({ ...sampleInput, allowlistIds: [] }),
      ).toThrow('Invalid AI input: allowlistIds');
    });

    it('rejects input with empty candidates', () => {
      expect(() =>
        validateTutorQuestionInput({ ...sampleInput, candidates: [] }),
      ).toThrow('Invalid AI input: candidates');
    });

    it('rejects candidate with id not in allowlistIds', () => {
      expect(() =>
        validateTutorQuestionInput({
          ...sampleInput,
          allowlistIds: ['vocab-1'], // vocab-2 is in candidates but not in allowlist
        }),
      ).toThrow('Invalid AI input: candidates[1].id');
    });

    it('rejects invalid questionType', () => {
      expect(() =>
        validateTutorQuestionInput({
          ...sampleInput,
          questionType:
            'FREE_ESSAY' as unknown as TutorQuestionInput['questionType'],
        }),
      ).toThrow('Invalid AI input: questionType');
    });

    it('rejects candidate with missing required string field', () => {
      expect(() =>
        validateTutorQuestionInput({
          ...sampleInput,
          candidates: [
            {
              id: 'vocab-1',
              wordDisplay: '',
              lemma: 'ambitious',
              partOfSpeech: 'adj',
              meaningVi: 'nghĩa',
              examples: [],
            },
          ],
        }),
      ).toThrow('Invalid AI input: candidates[0].wordDisplay');
    });
  });

  describe('parseTutorQuestionResult', () => {
    it('parses a valid MULTIPLE_CHOICE result', () => {
      const parsed = parseTutorQuestionResult(
        sampleMcResult,
        ['vocab-1', 'vocab-2'],
        'MULTIPLE_CHOICE',
      ) as MultipleChoiceResult;

      expect(parsed.questionType).toBe('MULTIPLE_CHOICE');
      expect(parsed.selectedCandidateId).toBe('vocab-1');
      expect(parsed.options).toHaveLength(4);
      expect(parsed.correctOptionId).toBe('A');
      expect(parsed.feedbackCorrectVi).toBe(sampleMcResult.feedbackCorrectVi);
    });

    it('parses a valid CONTEXTUAL_CLOZE result', () => {
      const parsed = parseTutorQuestionResult(
        sampleClozeResult,
        ['vocab-1'],
        'CONTEXTUAL_CLOZE',
      ) as ContextualClozeResult;

      expect(parsed.questionType).toBe('CONTEXTUAL_CLOZE');
      expect(parsed.sentenceWithBlank).toContain('___');
      expect(parsed.canonicalAnswer).toBe('ambitious');
    });

    it('parses a valid TYPED_RECALL result', () => {
      const parsed = parseTutorQuestionResult(
        sampleTypedRecallResult,
        ['vocab-1'],
        'TYPED_RECALL',
      ) as TypedRecallResult;

      expect(parsed.questionType).toBe('TYPED_RECALL');
      expect(parsed.recallPromptVi).toBe(
        sampleTypedRecallResult.recallPromptVi,
      );
      expect(parsed.canonicalAnswer).toBe('ambitious');
    });

    it('parses a valid MICRO_LESSON_RETEST with cloze', () => {
      const parsed = parseTutorQuestionResult(
        sampleMicroLessonClozeResult,
        ['vocab-1'],
        'MICRO_LESSON_RETEST',
      ) as MicroLessonRetestResult;

      expect(parsed.questionType).toBe('MICRO_LESSON_RETEST');
      expect(parsed.retestType).toBe('CONTEXTUAL_CLOZE');
      expect(parsed.microLessonTitle).toBe(
        sampleMicroLessonClozeResult.microLessonTitle,
      );
      expect(parsed.microLessonFactEn).toBe(
        sampleMicroLessonClozeResult.microLessonFactEn,
      );
      expect(parsed.microLessonFactVi).toBe(
        sampleMicroLessonClozeResult.microLessonFactVi,
      );
      expect(parsed.microLessonVi).toBe(
        sampleMicroLessonClozeResult.microLessonVi,
      );
      expect(parsed.sentenceWithBlank).toContain('___');
      expect(parsed.canonicalAnswer).toBe('ambitious');
    });

    it('parses a valid MICRO_LESSON_RETEST with typed recall', () => {
      const parsed = parseTutorQuestionResult(
        sampleMicroLessonRecallResult,
        ['vocab-1'],
        'MICRO_LESSON_RETEST',
      ) as MicroLessonRetestResult;

      expect(parsed.questionType).toBe('MICRO_LESSON_RETEST');
      expect(parsed.retestType).toBe('TYPED_RECALL');
      expect(parsed.microLessonTitle).toBe(
        sampleMicroLessonRecallResult.microLessonTitle,
      );
      expect(parsed.microLessonFactEn).toBe(
        sampleMicroLessonRecallResult.microLessonFactEn,
      );
      expect(parsed.microLessonFactVi).toBe(
        sampleMicroLessonRecallResult.microLessonFactVi,
      );
      expect(parsed.microLessonVi).toBe(
        sampleMicroLessonRecallResult.microLessonVi,
      );
      expect(parsed.recallPromptVi).toBe(
        sampleMicroLessonRecallResult.recallPromptVi,
      );
      expect(parsed.canonicalAnswer).toBe('ambitious');
    });

    it('rejects result with selectedCandidateId not in allowlist', () => {
      expect(() =>
        parseTutorQuestionResult(
          sampleMcResult,
          ['vocab-999'], // vocab-1 not in allowlist
          'MULTIPLE_CHOICE',
        ),
      ).toThrow('AI provider request failed');
    });

    it('rejects result with questionType mismatch', () => {
      expect(() =>
        parseTutorQuestionResult(
          sampleMcResult,
          ['vocab-1'],
          'CONTEXTUAL_CLOZE', // expected cloze but received MC
        ),
      ).toThrow('AI provider request failed');
    });

    it('rejects MULTIPLE_CHOICE with wrong option count', () => {
      const invalid = {
        ...sampleMcResult,
        options: [
          { id: 'A', text: 'opt 1' },
          { id: 'B', text: 'opt 2' },
          { id: 'C', text: 'opt 3' },
        ],
      };
      expect(() =>
        parseTutorQuestionResult(invalid, ['vocab-1'], 'MULTIPLE_CHOICE'),
      ).toThrow('AI provider request failed');
    });

    it('rejects MULTIPLE_CHOICE with duplicate option IDs', () => {
      const invalid = {
        ...sampleMcResult,
        options: [
          { id: 'A', text: 'opt 1' },
          { id: 'A', text: 'opt 2' },
          { id: 'C', text: 'opt 3' },
          { id: 'D', text: 'opt 4' },
        ],
      };
      expect(() =>
        parseTutorQuestionResult(invalid, ['vocab-1'], 'MULTIPLE_CHOICE'),
      ).toThrow('AI provider request failed');
    });

    it('rejects MULTIPLE_CHOICE with invalid correctOptionId', () => {
      const invalid = {
        ...sampleMcResult,
        correctOptionId: 'E',
      };
      expect(() =>
        parseTutorQuestionResult(invalid, ['vocab-1'], 'MULTIPLE_CHOICE'),
      ).toThrow('AI provider request failed');
    });

    it('rejects CONTEXTUAL_CLOZE without ___ in sentence', () => {
      const invalid = {
        ...sampleClozeResult,
        sentenceWithBlank: 'They launched an ambitious project.',
      };
      expect(() =>
        parseTutorQuestionResult(invalid, ['vocab-1'], 'CONTEXTUAL_CLOZE'),
      ).toThrow('AI provider request failed');
    });

    it('rejects output with extra unexpected keys', () => {
      const invalid = {
        ...sampleMcResult,
        hiddenScore: 100,
      };
      expect(() =>
        parseTutorQuestionResult(invalid, ['vocab-1'], 'MULTIPLE_CHOICE'),
      ).toThrow('AI provider request failed');
    });
  });
});
