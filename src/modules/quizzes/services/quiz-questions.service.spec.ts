import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CefrLevel,
  QuestionGenerationSource,
  QuestionType,
  QuizStatus,
} from '../../../../generated/prisma/enums';
import {
  type QuestionMutationState,
  QuizzesRepository,
} from '../repositories/quizzes.repository';
import { QuizQuestionsService } from './quiz-questions.service';

interface RepositoryMock {
  findQuizContentState: jest.Mock;
  findQuestionSourceTerm: jest.Mock;
  findQuestionDetail: jest.Mock;
  findQuestionForMutation: jest.Mock;
  findOptionForMutation: jest.Mock;
  createQuestion: jest.Mock;
  updateQuestion: jest.Mock;
  deleteQuestion: jest.Mock;
  createOption: jest.Mock;
  updateOption: jest.Mock;
  deleteOption: jest.Mock;
}

const editableQuiz = {
  id: 'quiz-id',
  articleId: 'article-id',
  articleContentVersion: 3,
  status: QuizStatus.DRAFT,
  reviewSessionCount: 0,
};

const currentTerm = {
  id: 'term-id',
  isActive: true,
  cefrLevel: CefrLevel.B1,
  sentence: {
    articleId: 'article-id',
    contentVersion: 3,
    isActive: true,
    article: { cefrLevel: CefrLevel.B1 },
  },
};

const question = (
  questionType: QuestionType,
  overrides: Partial<QuestionMutationState> = {},
) => ({
  id: 'question-id',
  quizId: 'quiz-id',
  articleSentenceTermId: 'term-id',
  questionType,
  generationSource: QuestionGenerationSource.ADMIN,
  difficultyCefr: CefrLevel.B1,
  prompt: 'Prompt',
  blankSentence:
    questionType === QuestionType.FILL_BLANK ? 'A ___ sentence.' : null,
  correctAnswerText:
    questionType === QuestionType.FILL_BLANK ? 'complete' : null,
  answerExplanation: null,
  isCaseSensitive: false,
  points: 1,
  displayOrder: 1,
  isActive: true,
  createdAt: new Date('2026-07-24T10:00:00Z'),
  updatedAt: new Date('2026-07-24T10:00:00Z'),
  options: [],
  reviewAnswerCount: 0,
  ...overrides,
});

describe('QuizQuestionsService', () => {
  let service: QuizQuestionsService;
  let repository: RepositoryMock;

  beforeEach(async () => {
    repository = {
      findQuizContentState: jest.fn().mockResolvedValue(editableQuiz),
      findQuestionSourceTerm: jest.fn().mockResolvedValue(currentTerm),
      findQuestionDetail: jest.fn(),
      findQuestionForMutation: jest.fn(),
      findOptionForMutation: jest.fn(),
      createQuestion: jest.fn(),
      updateQuestion: jest.fn(),
      deleteQuestion: jest.fn(),
      createOption: jest.fn(),
      updateOption: jest.fn(),
      deleteOption: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizQuestionsService,
        { provide: QuizzesRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(QuizQuestionsService);
  });

  it.each([
    QuestionType.SELECT_MEANING,
    QuestionType.SELECT_WORD,
    QuestionType.SELECT_CORRECT_CONTEXT,
  ])(
    'creates option-based question type %s without answer text',
    async (type) => {
      repository.createQuestion.mockImplementation(
        (_quizId: string, input: Record<string, unknown>) =>
          Promise.resolve(question(type, input)),
      );

      await service.createQuestion('admin-id', 'quiz-id', {
        articleSentenceTermId: 'term-id',
        questionType: type,
        prompt: '  Prompt  ',
      });

      expect(repository.createQuestion).toHaveBeenCalledWith('quiz-id', {
        articleSentenceTermId: 'term-id',
        questionType: type,
        generationSource: QuestionGenerationSource.ADMIN,
        difficultyCefr: CefrLevel.B1,
        prompt: 'Prompt',
        blankSentence: null,
        correctAnswerText: null,
        answerExplanation: null,
        isCaseSensitive: false,
        points: 1,
        displayOrder: 1,
        isActive: true,
        createdByUserId: 'admin-id',
        updatedByUserId: 'admin-id',
      });
    },
  );

  it('creates FILL_BLANK only with required nonblank fields', async () => {
    repository.createQuestion.mockResolvedValue(
      question(QuestionType.FILL_BLANK),
    );

    await service.createQuestion('admin-id', 'quiz-id', {
      articleSentenceTermId: 'term-id',
      questionType: QuestionType.FILL_BLANK,
      prompt: '  Fill it  ',
      blankSentence: '  A ___ sentence.  ',
      correctAnswerText: '  complete  ',
      points: 2,
      displayOrder: 3,
    });

    expect(repository.createQuestion).toHaveBeenCalledWith(
      'quiz-id',
      expect.objectContaining({
        blankSentence: 'A ___ sentence.',
        correctAnswerText: 'complete',
        points: 2,
        displayOrder: 3,
      }),
    );
  });

  it.each([
    [{ blankSentence: undefined }, 'blankSentence'],
    [{ correctAnswerText: undefined }, 'correctAnswerText'],
  ])('rejects FILL_BLANK missing $1', async (fields, expected) => {
    await expect(
      service.createQuestion('admin-id', 'quiz-id', {
        articleSentenceTermId: 'term-id',
        questionType: QuestionType.FILL_BLANK,
        prompt: 'Fill it',
        blankSentence: 'A ___ sentence.',
        correctAnswerText: 'complete',
        ...fields,
      }),
    ).rejects.toThrow(expected);
    expect(repository.createQuestion).not.toHaveBeenCalled();
  });

  it('rejects fill-blank fields on option-based questions', async () => {
    await expect(
      service.createQuestion('admin-id', 'quiz-id', {
        articleSentenceTermId: 'term-id',
        questionType: QuestionType.SELECT_WORD,
        prompt: 'Choose',
        correctAnswerText: 'word',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces article ownership and current active term state', async () => {
    repository.findQuestionSourceTerm.mockResolvedValueOnce({
      ...currentTerm,
      sentence: { ...currentTerm.sentence, articleId: 'other-article' },
    });
    await expect(
      service.createQuestion('admin-id', 'quiz-id', {
        articleSentenceTermId: 'term-id',
        questionType: QuestionType.SELECT_MEANING,
        prompt: 'Prompt',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    repository.findQuestionSourceTerm.mockResolvedValueOnce({
      ...currentTerm,
      isActive: false,
    });
    await expect(
      service.createQuestion('admin-id', 'quiz-id', {
        articleSentenceTermId: 'term-id',
        questionType: QuestionType.SELECT_MEANING,
        prompt: 'Prompt',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it.each([
    [{ ...editableQuiz, status: QuizStatus.PUBLISHED }],
    [{ ...editableQuiz, status: QuizStatus.ARCHIVED }],
    [{ ...editableQuiz, reviewSessionCount: 1 }],
  ])('blocks all content mutations for a non-editable quiz', async (state) => {
    repository.findQuizContentState.mockResolvedValue(state);

    await expect(
      service.createQuestion('admin-id', 'quiz-id', {
        articleSentenceTermId: 'term-id',
        questionType: QuestionType.SELECT_MEANING,
        prompt: 'Prompt',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.createQuestion).not.toHaveBeenCalled();
  });

  it('merges partial updates before validating the final FILL_BLANK shape', async () => {
    const current = question(QuestionType.FILL_BLANK);
    repository.findQuestionForMutation.mockResolvedValue(current);
    repository.updateQuestion.mockResolvedValue({
      ...current,
      prompt: 'Updated',
    });

    await service.updateQuestion('admin-id', 'quiz-id', 'question-id', {
      prompt: '  Updated  ',
    });

    expect(repository.updateQuestion).toHaveBeenCalledWith(
      'quiz-id',
      'question-id',
      { prompt: 'Updated', updatedByUserId: 'admin-id' },
    );
  });

  it('rejects changing to FILL_BLANK while options exist', async () => {
    repository.findQuestionForMutation.mockResolvedValue(
      question(QuestionType.SELECT_WORD, {
        options: [
          {
            id: 'option-id',
            quizQuestionId: 'question-id',
            optionText: 'Option',
            isCorrect: false,
            explanation: null,
            displayOrder: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    );

    await expect(
      service.updateQuestion('admin-id', 'quiz-id', 'question-id', {
        questionType: QuestionType.FILL_BLANK,
        blankSentence: 'A ___ sentence.',
        correctAnswerText: 'complete',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateQuestion).not.toHaveBeenCalled();
  });

  it('allows changing from FILL_BLANK and explicitly clears text-answer fields', async () => {
    repository.findQuestionForMutation.mockResolvedValue(
      question(QuestionType.FILL_BLANK),
    );
    repository.updateQuestion.mockResolvedValue(
      question(QuestionType.SELECT_MEANING),
    );

    await service.updateQuestion('admin-id', 'quiz-id', 'question-id', {
      questionType: QuestionType.SELECT_MEANING,
    });

    expect(repository.updateQuestion).toHaveBeenCalledWith(
      'quiz-id',
      'question-id',
      {
        questionType: QuestionType.SELECT_MEANING,
        blankSentence: null,
        correctAnswerText: null,
        updatedByUserId: 'admin-id',
      },
    );
  });

  it('maps duplicate display order to conflict', async () => {
    repository.findQuestionForMutation.mockResolvedValue(
      question(QuestionType.SELECT_MEANING),
    );
    repository.updateQuestion.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.updateQuestion('admin-id', 'quiz-id', 'question-id', {
        displayOrder: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects options for FILL_BLANK questions', async () => {
    repository.findQuestionForMutation.mockResolvedValue(
      question(QuestionType.FILL_BLANK),
    );

    await expect(
      service.createOption('admin-id', 'quiz-id', 'question-id', {
        optionText: 'Option',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.createOption).not.toHaveBeenCalled();
  });

  it('requires the full option ownership chain', async () => {
    repository.findOptionForMutation.mockResolvedValue(null);

    await expect(
      service.updateOption(
        'admin-id',
        'quiz-id',
        'cross-quiz-question',
        'option-id',
        { optionText: 'Updated' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.updateOption).not.toHaveBeenCalled();
  });

  it('blocks referenced question and option deletion', async () => {
    repository.findQuestionForMutation.mockResolvedValue(
      question(QuestionType.SELECT_MEANING, { reviewAnswerCount: 1 }),
    );
    await expect(
      service.deleteQuestion('admin-id', 'quiz-id', 'question-id'),
    ).rejects.toBeInstanceOf(ConflictException);

    repository.findOptionForMutation.mockResolvedValue({
      question: question(QuestionType.SELECT_MEANING),
      option: {
        id: 'option-id',
        quizQuestionId: 'question-id',
        optionText: 'Option',
        isCorrect: true,
        explanation: null,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      reviewAnswerCount: 1,
    });
    await expect(
      service.deleteOption('admin-id', 'quiz-id', 'question-id', 'option-id'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
