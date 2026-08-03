import { Test, TestingModule } from '@nestjs/testing';
import {
  ArticleStatus,
  CefrLevel,
  QuestionGenerationSource,
  QuestionType,
  QuizStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  QuizHistoryReferenceError,
  QuizQuestionTypeConflictError,
  QuizzesRepository,
  QuizSourceTermStateConflictError,
  QuizStatusTransitionConflictError,
} from './quizzes.repository';

describe('QuizzesRepository', () => {
  type Query = Record<string, unknown>;
  const quizFindMany: jest.MockedFunction<
    (query: Query) => Promise<unknown[]>
  > = jest.fn();
  const quizFindFirst: jest.MockedFunction<(query: Query) => Promise<unknown>> =
    jest.fn();
  const quizFindUnique: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const quizCount: jest.MockedFunction<(query: Query) => Promise<number>> =
    jest.fn();
  const quizCreate: jest.MockedFunction<(query: Query) => Promise<unknown>> =
    jest.fn();
  const quizUpdate: jest.MockedFunction<(query: Query) => Promise<unknown>> =
    jest.fn();
  const quizUpdateMany: jest.MockedFunction<
    (query: Query) => Promise<{ count: number }>
  > = jest.fn();
  const quizDeleteMany: jest.MockedFunction<
    (query: Query) => Promise<{ count: number }>
  > = jest.fn();
  const questionAggregate: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const questionFindFirst: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const questionCreate: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const questionUpdate: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const questionDelete: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const optionFindFirst: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const optionCreate: jest.MockedFunction<(query: Query) => Promise<unknown>> =
    jest.fn();
  const optionUpdateMany: jest.MockedFunction<
    (query: Query) => Promise<{ count: number }>
  > = jest.fn();
  const optionFindUnique: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const optionDelete: jest.MockedFunction<(query: Query) => Promise<unknown>> =
    jest.fn();
  const termFindUnique: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const termCount: jest.MockedFunction<(query: Query) => Promise<number>> =
    jest.fn();
  const articleFindUnique: jest.MockedFunction<
    (query: Query) => Promise<unknown>
  > = jest.fn();
  const transactionClient = {
    quiz: {
      findFirst: quizFindFirst,
      findUnique: quizFindUnique,
      updateMany: quizUpdateMany,
    },
    quizQuestion: {
      findFirst: questionFindFirst,
      create: questionCreate,
      update: questionUpdate,
      delete: questionDelete,
    },
    questionOption: {
      findFirst: optionFindFirst,
      create: optionCreate,
      updateMany: optionUpdateMany,
      findUnique: optionFindUnique,
      delete: optionDelete,
    },
    articleSentenceTerm: { count: termCount },
  };
  type TransactionCallback = (tx: typeof transactionClient) => Promise<unknown>;
  const transaction = jest.fn(
    (input: Promise<unknown>[] | TransactionCallback) =>
      Array.isArray(input) ? Promise.all(input) : input(transactionClient),
  );
  let repository: QuizzesRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation(
      (input: Promise<unknown>[] | TransactionCallback) =>
        Array.isArray(input) ? Promise.all(input) : input(transactionClient),
    );
    quizFindMany.mockResolvedValue([]);
    quizFindFirst.mockResolvedValue(null);
    quizFindUnique.mockResolvedValue(null);
    quizCount.mockResolvedValue(0);
    quizDeleteMany.mockResolvedValue({ count: 1 });
    quizUpdateMany.mockResolvedValue({ count: 1 });
    questionFindFirst.mockResolvedValue(null);
    optionFindFirst.mockResolvedValue(null);
    optionUpdateMany.mockResolvedValue({ count: 1 });
    optionFindUnique.mockResolvedValue(null);
    termFindUnique.mockResolvedValue(null);
    termCount.mockResolvedValue(1);
    questionAggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { points: null },
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizzesRepository,
        {
          provide: PrismaService,
          useValue: {
            quiz: {
              findMany: quizFindMany,
              findFirst: quizFindFirst,
              findUnique: quizFindUnique,
              count: quizCount,
              create: quizCreate,
              update: quizUpdate,
              updateMany: quizUpdateMany,
              deleteMany: quizDeleteMany,
            },
            quizQuestion: {
              aggregate: questionAggregate,
              findFirst: questionFindFirst,
              create: questionCreate,
              update: questionUpdate,
              delete: questionDelete,
            },
            questionOption: {
              findFirst: optionFindFirst,
              create: optionCreate,
              updateMany: optionUpdateMany,
              findUnique: optionFindUnique,
              delete: optionDelete,
            },
            articleSentenceTerm: {
              findUnique: termFindUnique,
              count: termCount,
            },
            article: { findUnique: articleFindUnique },
            $transaction: transaction,
          },
        },
      ],
    }).compile();
    repository = module.get(QuizzesRepository);
  });

  it('filters public lists by published quiz and published article in PostgreSQL', async () => {
    await repository.findPublished({
      page: 2,
      limit: 10,
      articleId: 'article-id',
      q: 'tech',
    });

    expect(quizFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: QuizStatus.PUBLISHED,
          article: { is: { status: ArticleStatus.PUBLISHED } },
          articleId: 'article-id',
          OR: [
            { title: { contains: 'tech', mode: 'insensitive' } },
            { description: { contains: 'tech', mode: 'insensitive' } },
          ],
        },
        skip: 10,
        take: 10,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(quizCount.mock.calls[0][0]).toMatchObject({
      where: {
        status: QuizStatus.PUBLISHED,
        article: { is: { status: ArticleStatus.PUBLISHED } },
      },
    });
    expect(JSON.stringify(quizFindMany.mock.calls)).not.toContain('questions');
    expect(JSON.stringify(quizFindMany.mock.calls)).not.toContain('correct');
  });

  it('uses a safe public detail projection and inaccessible-article filter', async () => {
    await repository.findPublishedDetail('quiz-id');

    expect(quizFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'quiz-id',
          status: QuizStatus.PUBLISHED,
          article: { is: { status: ArticleStatus.PUBLISHED } },
        },
      }),
    );
    expect(JSON.stringify(quizFindFirst.mock.calls)).not.toContain('questions');
    expect(JSON.stringify(quizFindFirst.mock.calls)).not.toContain(
      'contentHtml',
    );
    expect(JSON.stringify(quizFindFirst.mock.calls)).not.toContain(
      'correctAnswer',
    );
  });

  it('counts and sums only active questions with a database aggregate', async () => {
    questionAggregate.mockResolvedValue({
      _count: { _all: 3 },
      _sum: { points: 7 },
    });

    await expect(
      repository.aggregateActiveQuestions('quiz-id'),
    ).resolves.toEqual({ questionCount: 3, totalPoints: 7 });
    expect(questionAggregate).toHaveBeenCalledWith({
      where: { quizId: 'quiz-id', isActive: true },
      _count: { _all: true },
      _sum: { points: true },
    });
  });

  it('applies admin filters, pagination, stable ordering, and active counts', async () => {
    quizFindMany.mockResolvedValue([
      {
        id: 'quiz-id',
        articleId: 'article-id',
        title: 'Quiz',
        description: null,
        status: QuizStatus.DRAFT,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { questions: 2 },
      },
    ]);

    const result = await repository.findAdmin({
      page: 1,
      limit: 20,
      status: QuizStatus.DRAFT,
      articleId: 'article-id',
      q: 'Quiz',
    });

    expect(quizFindMany.mock.calls[0][0]).toMatchObject({
      where: {
        status: QuizStatus.DRAFT,
        articleId: 'article-id',
      },
      skip: 0,
      take: 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        _count: {
          select: { questions: { where: { isActive: true } } },
        },
      },
    });
    expect(result.items[0].questionCount).toBe(2);
    expect(JSON.stringify(quizFindMany.mock.calls)).not.toContain('include');
  });

  it('uses explicit ordered nested admin projections without audit users', async () => {
    await repository.findAdminDetail('quiz-id');

    expect(quizFindUnique.mock.calls[0][0]).toMatchObject({
      where: { id: 'quiz-id' },
      select: {
        questions: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            correctAnswerText: true,
            answerExplanation: true,
            quizId: true,
            options: {
              orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
              select: {
                isCorrect: true,
                quizQuestionId: true,
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(quizFindUnique.mock.calls)).not.toContain(
      'createdBy',
    );
    expect(JSON.stringify(quizFindUnique.mock.calls)).not.toContain(
      'updatedBy',
    );
  });

  it('forces DRAFT and null publishedAt while writing JWT audit IDs', async () => {
    await repository.create({
      articleId: 'article-id',
      title: 'Quiz',
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });

    expect(quizCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          articleId: 'article-id',
          title: 'Quiz',
          status: QuizStatus.DRAFT,
          publishedAt: null,
          createdByUserId: 'admin-id',
          updatedByUserId: 'admin-id',
        },
      }),
    );
  });

  it('conditionally deletes only an unreferenced draft', async () => {
    await expect(repository.deleteUnusedDraft('quiz-id')).resolves.toBe(true);
    expect(quizDeleteMany).toHaveBeenCalledWith({
      where: {
        id: 'quiz-id',
        status: QuizStatus.DRAFT,
        reviewSessions: { none: {} },
      },
    });
  });

  it('loads quiz editability and current article version with aggregate session count', async () => {
    quizFindUnique.mockResolvedValue({
      id: 'quiz-id',
      articleId: 'article-id',
      status: QuizStatus.DRAFT,
      article: { contentVersion: 4 },
      _count: { reviewSessions: 1 },
    });

    await expect(repository.findQuizContentState('quiz-id')).resolves.toEqual({
      id: 'quiz-id',
      articleId: 'article-id',
      status: QuizStatus.DRAFT,
      articleContentVersion: 4,
      reviewSessionCount: 1,
    });
    expect(quizFindUnique.mock.calls[0][0]).toMatchObject({
      where: { id: 'quiz-id' },
      select: {
        article: { select: { contentVersion: true } },
        _count: { select: { reviewSessions: true } },
      },
    });
  });

  it('loads only active questions and explicit publication fields', async () => {
    await repository.findPublicationSnapshot('quiz-id');

    expect(quizFindUnique.mock.calls[0][0]).toMatchObject({
      where: { id: 'quiz-id' },
      select: {
        id: true,
        articleId: true,
        status: true,
        publishedAt: true,
        article: {
          select: {
            id: true,
            status: true,
            contentVersion: true,
          },
        },
        questions: {
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            articleSentenceTerm: {
              select: {
                isActive: true,
                sentence: {
                  select: {
                    articleId: true,
                    contentVersion: true,
                    isActive: true,
                  },
                },
              },
            },
            options: {
              orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
    expect(JSON.stringify(quizFindUnique.mock.calls)).not.toContain(
      'createdBy',
    );
  });

  it('conditionally transitions status and preserves omitted publishedAt', async () => {
    quizFindUnique.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.ARCHIVED,
      publishedAt: new Date('2026-07-24T10:00:00Z'),
    });

    await repository.transitionQuizStatus({
      quizId: 'quiz-id',
      expectedStatus: QuizStatus.PUBLISHED,
      status: QuizStatus.ARCHIVED,
      updatedByUserId: 'admin-id',
    });

    expect(quizUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'quiz-id',
        status: QuizStatus.PUBLISHED,
      },
      data: {
        status: QuizStatus.ARCHIVED,
        updatedByUserId: 'admin-id',
      },
    });
  });

  it('makes unused restore conditional on no review session', async () => {
    quizFindUnique.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.DRAFT,
      publishedAt: null,
    });

    await repository.transitionQuizStatus({
      quizId: 'quiz-id',
      expectedStatus: QuizStatus.ARCHIVED,
      status: QuizStatus.DRAFT,
      publishedAt: null,
      requireNoReviewSessions: true,
      updatedByUserId: 'admin-id',
    });

    expect(quizUpdateMany.mock.calls[0][0]).toMatchObject({
      where: {
        id: 'quiz-id',
        status: QuizStatus.ARCHIVED,
        reviewSessions: { none: {} },
      },
      data: {
        status: QuizStatus.DRAFT,
        publishedAt: null,
      },
    });
  });

  it('rejects a lost conditional transition race', async () => {
    quizUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.transitionQuizStatus({
        quizId: 'quiz-id',
        expectedStatus: QuizStatus.DRAFT,
        status: QuizStatus.PUBLISHED,
        publishedAt: new Date(),
        requirePublishedArticle: true,
        updatedByUserId: 'admin-id',
      }),
    ).rejects.toBeInstanceOf(QuizStatusTransitionConflictError);
    expect(quizUpdateMany.mock.calls[0][0]).toMatchObject({
      where: {
        id: 'quiz-id',
        status: QuizStatus.DRAFT,
        article: { is: { status: ArticleStatus.PUBLISHED } },
      },
    });
    expect(quizFindUnique).not.toHaveBeenCalled();
  });

  it('resolves article_sentence_terms ownership without user vocabulary data', async () => {
    await repository.findQuestionSourceTerm('term-id');

    expect(termFindUnique).toHaveBeenCalledWith({
      where: { id: 'term-id' },
      select: {
        id: true,
        isActive: true,
        cefrLevel: true,
        sentence: {
          select: {
            articleId: true,
            contentVersion: true,
            isActive: true,
            article: { select: { cefrLevel: true } },
          },
        },
      },
    });
    expect(JSON.stringify(termFindUnique.mock.calls)).not.toContain(
      'userVocabular',
    );
  });

  it('uses the full quiz-question-option ownership chain', async () => {
    await repository.findOptionForMutation(
      'quiz-id',
      'question-id',
      'option-id',
    );

    expect(optionFindFirst.mock.calls[0][0]).toMatchObject({
      where: {
        id: 'option-id',
        quizQuestionId: 'question-id',
        quizQuestion: { is: { quizId: 'quiz-id' } },
      },
      select: { _count: { select: { reviewAnswers: true } } },
    });
  });

  it('creates a question inside a serializable editable-quiz transaction', async () => {
    quizFindFirst.mockResolvedValue({
      articleId: 'article-id',
      article: { contentVersion: 3 },
    });
    questionCreate.mockResolvedValue({
      id: 'question-id',
      options: [],
    });

    await repository.createQuestion('quiz-id', {
      articleSentenceTermId: 'term-id',
      questionType: QuestionType.SELECT_MEANING,
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

    expect(quizFindFirst.mock.calls[0][0]).toMatchObject({
      where: {
        id: 'quiz-id',
        status: QuizStatus.DRAFT,
        reviewSessions: { none: {} },
      },
    });
    expect(termCount.mock.calls[0][0]).toMatchObject({
      where: {
        id: 'term-id',
        isActive: true,
        sentence: {
          is: {
            articleId: 'article-id',
            contentVersion: 3,
            isActive: true,
          },
        },
      },
    });
    expect(questionCreate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(transaction.mock.calls)).toContain(
      '"isolationLevel":"Serializable"',
    );
  });

  it('rolls back before question creation when current term ownership changes', async () => {
    quizFindFirst.mockResolvedValue({
      articleId: 'article-id',
      article: { contentVersion: 3 },
    });
    termCount.mockResolvedValue(0);

    await expect(
      repository.createQuestion('quiz-id', {
        articleSentenceTermId: 'foreign-term',
        questionType: QuestionType.SELECT_WORD,
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
      }),
    ).rejects.toBeInstanceOf(QuizSourceTermStateConflictError);
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it('blocks type switching to FILL_BLANK when options appear in the transaction', async () => {
    quizFindFirst.mockResolvedValue({
      articleId: 'article-id',
      article: { contentVersion: 3 },
    });
    questionFindFirst.mockResolvedValue({
      id: 'question-id',
      _count: { options: 1 },
    });

    await expect(
      repository.updateQuestion('quiz-id', 'question-id', {
        questionType: QuestionType.FILL_BLANK,
        blankSentence: 'A ___ sentence.',
        correctAnswerText: 'complete',
        updatedByUserId: 'admin-id',
      }),
    ).rejects.toBeInstanceOf(QuizQuestionTypeConflictError);
    expect(questionUpdate).not.toHaveBeenCalled();
  });

  it('uses review-answer pre-checks before deleting questions and options', async () => {
    quizFindFirst.mockResolvedValue({
      articleId: 'article-id',
      article: { contentVersion: 3 },
    });
    questionFindFirst.mockResolvedValueOnce({
      id: 'question-id',
      _count: { reviewSessionItems: 1, reviewAnswers: 0 },
    });
    await expect(
      repository.deleteQuestion('quiz-id', 'question-id'),
    ).rejects.toBeInstanceOf(QuizHistoryReferenceError);
    expect(questionDelete).not.toHaveBeenCalled();

    questionFindFirst.mockResolvedValueOnce({
      id: 'question-id',
      questionType: QuestionType.SELECT_WORD,
    });
    optionFindFirst.mockResolvedValue({
      id: 'option-id',
      _count: { reviewAnswers: 1 },
    });
    await expect(
      repository.deleteOption('quiz-id', 'question-id', 'option-id'),
    ).rejects.toBeInstanceOf(QuizHistoryReferenceError);
    expect(optionDelete).not.toHaveBeenCalled();
  });
});
