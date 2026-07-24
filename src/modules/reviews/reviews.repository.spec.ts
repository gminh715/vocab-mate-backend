/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client';
import {
  ArticleStatus,
  QuestionType,
  QuizStatus,
  ReviewSessionStatus,
  ReviewSessionType,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { AnswerGradingService } from './services/answer-grading.service';
import { ReviewSchedulerService } from './services/review-scheduler.service';
import { ReviewsRepository } from './reviews.repository';

describe('ReviewsRepository', () => {
  const query = jest.fn();
  const quizFindFirst = jest.fn();
  const sessionFindFirst = jest.fn();
  const sessionCreate = jest.fn();
  const sessionUpdateMany = jest.fn();
  const questionFindFirst = jest.fn();
  const questionFindMany = jest.fn();
  const questionCount = jest.fn();
  const answerFindFirst = jest.fn();
  const answerCreate = jest.fn();
  const vocabularyFindUnique = jest.fn();
  const vocabularyUpdate = jest.fn();
  const tx = {
    quiz: { findFirst: quizFindFirst },
    reviewSession: {
      findFirst: sessionFindFirst,
      create: sessionCreate,
      updateMany: sessionUpdateMany,
    },
    quizQuestion: {
      findFirst: questionFindFirst,
      findMany: questionFindMany,
    },
    reviewAnswer: { findFirst: answerFindFirst, create: answerCreate },
    userVocabulary: {
      findUnique: vocabularyFindUnique,
      update: vocabularyUpdate,
    },
  };
  type TransactionInput = unknown[] | ((client: typeof tx) => Promise<unknown>);
  const transaction: jest.MockedFunction<
    (input: TransactionInput, options?: unknown) => Promise<unknown>
  > = jest.fn((input) =>
    Array.isArray(input) ? Promise.all(input) : input(tx),
  );
  let repository: ReviewsRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation((input) =>
      Array.isArray(input) ? Promise.all(input) : input(tx),
    );
    const module = await Test.createTestingModule({
      providers: [
        ReviewsRepository,
        AnswerGradingService,
        ReviewSchedulerService,
        {
          provide: PrismaService,
          useValue: {
            reviewSession: { findFirst: sessionFindFirst },
            quizQuestion: {
              count: questionCount,
              findFirst: questionFindFirst,
            },
            $transaction: transaction,
            $queryRaw: query,
          },
        },
      ],
    }).compile();
    repository = module.get(ReviewsRepository);
  });

  it('starts with published eligibility, Serializable isolation, safe ordered projection', async () => {
    quizFindFirst.mockResolvedValue({
      id: 'quiz',
      articleId: 'article',
      questions: [
        {
          id: 'question',
          questionType: QuestionType.SELECT_WORD,
          prompt: 'Prompt',
          blankSentence: null,
          points: 1,
          displayOrder: 1,
          options: [{ id: 'option', optionText: 'Text', displayOrder: 1 }],
        },
      ],
    });
    sessionFindFirst.mockResolvedValue(null);
    sessionCreate.mockResolvedValue({
      id: 'session',
      sessionType: ReviewSessionType.QUIZ,
      quizId: 'quiz',
      articleId: 'article',
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });

    const result = await repository.startQuizSession('user', 'quiz');

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(quizFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'quiz',
          status: QuizStatus.PUBLISHED,
          article: { is: { status: ArticleStatus.PUBLISHED } },
          questions: { some: { isActive: true } },
        },
      }),
    );
    const serializedQuery = JSON.stringify(quizFindFirst.mock.calls[0][0]);
    expect(serializedQuery).not.toMatch(
      /isCorrect|correctAnswerText|answerExplanation|explanation/,
    );
    expect(result?.questions).toEqual([
      expect.objectContaining({
        id: 'question',
        options: [{ id: 'option', text: 'Text', displayOrder: 1 }],
      }),
    ]);
  });

  it('retries P2034 and re-runs the complete Serializable transaction', async () => {
    transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      );
    quizFindFirst.mockResolvedValue(null);

    await expect(
      repository.startQuizSession('user', 'quiz'),
    ).resolves.toBeNull();
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('scopes session and answer progress by owner/session and selects first unanswered', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      quizId: 'quiz',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    questionCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    questionFindFirst.mockResolvedValue(null);

    await repository.getSessionState('owner', 'session');

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session', userId: 'owner' } }),
    );
    expect(questionCount.mock.calls[1][0]).toMatchObject({
      where: {
        quizId: 'quiz',
        isActive: true,
        reviewAnswers: { some: { reviewSessionId: 'session' } },
      },
    });
    expect(questionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewAnswers: { none: { reviewSessionId: 'session' } },
        }),
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('inserts answer and saved-vocabulary schedule in the same transaction', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      quizId: 'quiz',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    questionFindFirst.mockResolvedValue({
      id: 'question',
      articleVocabularyId: 'term',
      questionType: QuestionType.SELECT_MEANING,
      correctAnswerText: null,
      answerExplanation: null,
      isCaseSensitive: false,
      points: 2,
      options: [
        {
          id: 'option',
          optionText: 'Correct',
          isCorrect: true,
          explanation: null,
        },
      ],
    });
    answerFindFirst.mockResolvedValue(null);
    vocabularyFindUnique.mockResolvedValue({
      id: 'vocabulary',
      reviewIntervalDays: null,
    });
    answerCreate.mockResolvedValue({ id: 'answer' });
    vocabularyUpdate.mockResolvedValue({ id: 'vocabulary' });

    await repository.submitAnswer('owner', 'session', {
      quizQuestionId: 'question',
      selectedOptionId: 'option',
    });

    expect(answerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewSessionId: 'session',
          userVocabularyId: 'vocabulary',
          attemptNumber: 1,
          isCorrect: true,
        }),
      }),
    );
    expect(vocabularyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vocabulary' },
        data: expect.objectContaining({ reviewIntervalDays: 1 }),
      }),
    );
  });
});
