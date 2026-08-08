/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client';
import {
  ArticleStatus,
  CefrLevel,
  LearningStatus,
  QuestionGenerationSource,
  QuestionType,
  QuizStatus,
  ReviewAgentAction,
  ReviewDecisionKind,
  ReviewDecisionSource,
  ReviewErrorType,
  ReviewSessionItemStatus,
  ReviewSessionStatus,
  ReviewSessionType,
  ReviewSkillDimension,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { AnswerGradingService } from './services/answer-grading.service';
import { InvisibleReviewScoringService } from './services/invisible-review-scoring.service';
import { QuestionSelectionService } from './services/question-selection.service';
import {
  NoUsableReviewQuestionError,
  ReviewAgentDecisionConflictError,
  ReviewResourceNotFoundError,
  ReviewsRepository,
  ReviewSubmissionConflictError,
} from './reviews.repository';

describe('ReviewsRepository', () => {
  const query = jest.fn();
  const quizFindFirst = jest.fn();
  const articleFindFirst = jest.fn();
  const collectionFindFirst = jest.fn();
  const sessionFindFirst = jest.fn();
  const sessionCreate = jest.fn();
  const sessionUpdate = jest.fn();
  const sessionUpdateMany = jest.fn();
  const questionFindFirst = jest.fn();
  const questionFindMany = jest.fn();
  const questionCount = jest.fn();
  const questionCreate = jest.fn();
  const questionCreateManyAndReturn = jest.fn();
  const optionCreateMany = jest.fn();
  const itemFindFirst = jest.fn();
  const itemFindMany = jest.fn();
  const itemCount = jest.fn();
  const itemCreateMany = jest.fn();
  const itemUpdate = jest.fn();
  const itemAggregate = jest.fn();
  const answerCreate = jest.fn();
  const answerFindFirst = jest.fn();
  const answerUpdate = jest.fn();
  const answerGroupBy = jest.fn();
  const decisionCreate = jest.fn();
  const decisionFindFirst = jest.fn();
  const profileFindUnique = jest.fn();
  const vocabularyFindUnique = jest.fn();
  const vocabularyFindMany = jest.fn();
  const vocabularyUpdate = jest.fn();
  const tx = {
    $queryRaw: query,
    quiz: { findFirst: quizFindFirst },
    article: { findFirst: articleFindFirst },
    vocabularyCollection: { findFirst: collectionFindFirst },
    reviewSession: {
      findFirst: sessionFindFirst,
      create: sessionCreate,
      update: sessionUpdate,
      updateMany: sessionUpdateMany,
    },
    quizQuestion: {
      findFirst: questionFindFirst,
      findMany: questionFindMany,
      create: questionCreate,
      createManyAndReturn: questionCreateManyAndReturn,
    },
    questionOption: { createMany: optionCreateMany },
    reviewSessionItem: {
      findFirst: itemFindFirst,
      findMany: itemFindMany,
      createMany: itemCreateMany,
      update: itemUpdate,
      count: itemCount,
      aggregate: itemAggregate,
    },
    reviewAnswer: {
      create: answerCreate,
      findFirst: answerFindFirst,
      update: answerUpdate,
      groupBy: answerGroupBy,
    },
    reviewAgentDecision: {
      create: decisionCreate,
      findFirst: decisionFindFirst,
    },
    userProfile: { findUnique: profileFindUnique },
    userVocabulary: {
      findUnique: vocabularyFindUnique,
      findMany: vocabularyFindMany,
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
  const reviewVocabulary = {
    id: 'vocabulary',
    userId: 'owner',
    articleSentenceTermId: 'term',
    learningStatus: LearningStatus.REVIEWING,
    savedWordDisplay: 'word',
    savedLemma: 'word',
    savedPartOfSpeech: 'noun',
    savedMeaningVi: 'meaning',
    savedContextSentence: 'A word here.',
    savedExplanation: null,
    savedCefrLevel: CefrLevel.B1,
    savedAt: new Date('2026-07-01T00:00:00Z'),
    lastReviewedAt: new Date('2026-07-31T00:00:00Z'),
    nextReviewAt: new Date('2026-08-01T00:00:00Z'),
    reviewIntervalDays: 2,
    consecutiveCorrectReviews: 1,
    lapseCount: 0,
    lastReviewScore: 4,
    articleSentenceTerm: {
      sentence: { article: { categoryId: 'category' } },
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue([]);
    vocabularyFindMany.mockResolvedValue([]);
    answerGroupBy.mockResolvedValue([]);
    profileFindUnique.mockResolvedValue(null);
    transaction.mockImplementation((input) =>
      Array.isArray(input) ? Promise.all(input) : input(tx),
    );
    itemCount.mockResolvedValue(0);
    itemFindMany.mockResolvedValue([]);
    itemAggregate.mockResolvedValue({ _max: { sequenceNumber: 1 } });
    questionFindFirst.mockResolvedValue(null);
    questionFindMany.mockResolvedValue([]);
    questionCreateManyAndReturn.mockResolvedValue([]);
    sessionUpdate.mockResolvedValue({
      id: 'session',
      sessionType: ReviewSessionType.QUIZ,
      quizId: 'quiz',
      articleId: 'article',
      collectionId: null,
      status: ReviewSessionStatus.COMPLETED,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    const module = await Test.createTestingModule({
      providers: [
        ReviewsRepository,
        AnswerGradingService,
        InvisibleReviewScoringService,
        QuestionSelectionService,
        {
          provide: PrismaService,
          useValue: {
            reviewSession: {
              findFirst: sessionFindFirst,
              updateMany: sessionUpdateMany,
            },
            quizQuestion: {
              count: questionCount,
              findFirst: questionFindFirst,
            },
            reviewSessionItem: {
              count: itemCount,
              findFirst: itemFindFirst,
            },
            reviewAgentDecision: { findFirst: decisionFindFirst },
            $transaction: transaction,
            $queryRaw: query,
          },
        },
      ],
    }).compile();
    repository = module.get(ReviewsRepository);
  });

  it('persists an AI question and its options atomically with AI provenance', async () => {
    questionCreate.mockResolvedValue({ id: 'created-ai' });

    await expect(
      repository.cacheAiQuestion({
        quizId: null,
        articleSentenceTermId: 'term',
        questionType: QuestionType.SELECT_MEANING,
        generationSource: QuestionGenerationSource.AI,
        difficultyCefr: CefrLevel.B1,
        prompt: 'Choose the contextual meaning.',
        blankSentence: null,
        correctAnswerText: null,
        answerExplanation: 'This is the saved meaning. It fits this context.',
        isCaseSensitive: false,
        points: 1,
        displayOrder: 1,
        isActive: true,
        options: [
          {
            optionText: 'meaning',
            isCorrect: true,
            explanation: null,
            displayOrder: 1,
          },
          {
            optionText: 'other',
            isCorrect: false,
            explanation: null,
            displayOrder: 2,
          },
        ],
      }),
    ).resolves.toEqual({ id: 'created-ai' });
    expect(questionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        generationSource: QuestionGenerationSource.AI,
        options: {
          create: [
            expect.objectContaining({
              generationSource: QuestionGenerationSource.AI,
              isCorrect: true,
            }),
            expect.objectContaining({
              generationSource: QuestionGenerationSource.AI,
              isCorrect: false,
            }),
          ],
        },
      }),
      select: { id: true },
    });
  });

  it('loads the unique AI cache winner after a concurrent duplicate insert', async () => {
    questionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'winner' });
    questionCreate.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'P2002' }),
    );

    await expect(
      repository.cacheAiQuestion({
        quizId: null,
        articleSentenceTermId: 'term',
        questionType: QuestionType.FILL_BLANK,
        generationSource: QuestionGenerationSource.AI,
        difficultyCefr: CefrLevel.B1,
        prompt: 'Complete the sentence.',
        blankSentence: 'A ___ here.',
        correctAnswerText: 'word',
        answerExplanation:
          'The word completes the sentence. It fits the context.',
        isCaseSensitive: false,
        points: 1,
        displayOrder: 1,
        isActive: true,
        options: [],
      }),
    ).resolves.toEqual({ id: 'winner' });
    expect(questionCreate).toHaveBeenCalledTimes(1);
  });

  it('starts a fixed quiz from eligible saved vocabularies in a Serializable transaction', async () => {
    quizFindFirst.mockResolvedValue({
      id: 'quiz',
      articleId: 'article',
      questions: [{ articleSentenceTermId: 'term' }],
    });
    sessionFindFirst.mockResolvedValue(null);
    vocabularyFindMany.mockResolvedValue([]).mockResolvedValueOnce([
      {
        id: 'vocabulary',
        articleSentenceTermId: 'term',
        learningStatus: LearningStatus.REVIEWING,
        savedWordDisplay: 'word',
        savedMeaningVi: 'meaning',
        savedContextSentence: 'A word here.',
        savedCefrLevel: 'B1',
        savedAt: new Date(),
        nextReviewAt: new Date('2026-08-01T00:00:00Z'),
        reviewIntervalDays: 2,
        consecutiveCorrectReviews: 1,
        lapseCount: 0,
      },
    ]);
    questionFindMany.mockResolvedValue([
      {
        id: 'question',
        articleSentenceTermId: 'term',
        questionType: QuestionType.SELECT_WORD,
      },
    ]);
    itemCreateMany.mockResolvedValue({ count: 1 });
    sessionCreate.mockResolvedValue({
      id: 'session',
      sessionType: ReviewSessionType.QUIZ,
      quizId: 'quiz',
      articleId: 'article',
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });

    const result = await repository.startSession(
      'user',
      {
        sessionType: ReviewSessionType.QUIZ,
        quizId: 'quiz',
        limit: 20,
      },
      new Date('2026-08-03T00:00:00Z'),
    );

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
    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userVocabularyId: 'vocabulary',
          quizQuestionId: 'question',
          sequenceNumber: 1,
        }),
      ],
    });
    expect(result?.session.id).toBe('session');
  });

  it.each(['P2034', 'P2002'])(
    'retries %s and re-runs the complete Serializable start transaction',
    async (code) => {
      transaction
        .mockRejectedValueOnce({ code })
        .mockImplementationOnce(
          (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
        );
      quizFindFirst.mockResolvedValue({
        id: 'quiz',
        articleId: 'article',
        questions: [{ articleSentenceTermId: 'term' }],
      });
      sessionFindFirst.mockResolvedValue(null);
      vocabularyFindMany.mockResolvedValue([]);

      await expect(
        repository.startSession(
          'user',
          {
            sessionType: ReviewSessionType.QUIZ,
            quizId: 'quiz',
            limit: 20,
          },
          new Date(),
        ),
      ).resolves.toBeNull();
      expect(transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('prioritizes overdue, lapsed unscheduled, then NEW vocabulary for daily review', async () => {
    sessionFindFirst.mockResolvedValue(null);
    vocabularyFindMany
      .mockResolvedValueOnce([
        {
          ...reviewVocabulary,
          id: 'overdue',
          articleSentenceTermId: 'term-overdue',
        },
      ])
      .mockResolvedValueOnce([
        {
          ...reviewVocabulary,
          id: 'unscheduled',
          articleSentenceTermId: 'term-unscheduled',
          nextReviewAt: null,
          lapseCount: 4,
        },
      ])
      .mockResolvedValueOnce([
        {
          ...reviewVocabulary,
          id: 'new',
          articleSentenceTermId: 'term-new',
          learningStatus: LearningStatus.NEW,
          nextReviewAt: null,
        },
      ]);
    questionFindMany.mockResolvedValue(
      ['overdue', 'unscheduled', 'new'].map((suffix) => ({
        id: `cached-${suffix}`,
        articleSentenceTermId: `term-${suffix}`,
        questionType: QuestionType.FILL_BLANK,
        generationSource: QuestionGenerationSource.AI,
        difficultyCefr: CefrLevel.B1,
        prompt: 'Complete the original sentence with the saved vocabulary.',
        blankSentence: 'A ___ here.',
        correctAnswerText: 'word',
        answerExplanation: null,
        isCaseSensitive: false,
        points: 1,
        options: [],
      })),
    );
    sessionCreate.mockResolvedValue({
      id: 'daily-session',
      sessionType: ReviewSessionType.DAILY_REVIEW,
      quizId: null,
      articleId: null,
      collectionId: null,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemCreateMany.mockResolvedValue({ count: 3 });

    await repository.startSession(
      'user',
      { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 3 },
      new Date('2026-08-03T00:00:00Z'),
      ['overdue', 'unscheduled', 'new'].map((suffix) => ({
        userVocabularyId: suffix,
        quizQuestionId: `cached-${suffix}`,
        articleSentenceTermId: `term-${suffix}`,
        difficultyCefr: CefrLevel.B1,
        questionType: QuestionType.FILL_BLANK,
      })),
    );

    expect(vocabularyFindMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        userId: 'user',
        learningStatus: {
          in: [
            LearningStatus.NEW,
            LearningStatus.LEARNING,
            LearningStatus.REVIEWING,
          ],
        },
        OR: [
          { nextReviewAt: { lte: new Date('2026-08-03T00:00:00Z') } },
          { nextReviewAt: null },
        ],
        nextReviewAt: { lte: new Date('2026-08-03T00:00:00Z') },
      }),
    );
    expect(vocabularyFindMany.mock.calls[0][0].orderBy).toEqual([
      { lapseCount: 'desc' },
      { nextReviewAt: 'asc' },
      { savedAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(vocabularyFindMany.mock.calls[1][0].where).toEqual(
      expect.objectContaining({
        nextReviewAt: null,
        learningStatus: {
          in: [LearningStatus.LEARNING, LearningStatus.REVIEWING],
        },
      }),
    );
    expect(vocabularyFindMany.mock.calls[2][0].where).toEqual(
      expect.objectContaining({
        nextReviewAt: null,
        learningStatus: LearningStatus.NEW,
      }),
    );
    expect(itemCreateMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        userVocabularyId: 'overdue',
        sequenceNumber: 1,
      }),
      expect.objectContaining({
        userVocabularyId: 'unscheduled',
        sequenceNumber: 2,
      }),
      expect.objectContaining({ userVocabularyId: 'new', sequenceNumber: 3 }),
    ]);
  });

  it.each([LearningStatus.LEARNING, LearningStatus.REVIEWING])(
    'includes unscheduled %s vocabulary in daily review and respects the item limit',
    async (learningStatus) => {
      sessionFindFirst.mockResolvedValue(null);
      vocabularyFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          ...reviewVocabulary,
          id: `unscheduled-${learningStatus.toLowerCase()}`,
          learningStatus,
          nextReviewAt: null,
        },
      ]);

      const candidates = await repository.getAiQuestionGenerationCandidates(
        'owner',
        { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 1 },
        new Date('2026-08-03T00:00:00Z'),
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].vocabulary.id).toBe(
        `unscheduled-${learningStatus.toLowerCase()}`,
      );
      expect(vocabularyFindMany).toHaveBeenCalledTimes(2);
      expect(vocabularyFindMany.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          take: 1,
          where: expect.objectContaining({
            userId: 'owner',
            OR: [
              { nextReviewAt: { lte: new Date('2026-08-03T00:00:00Z') } },
              { nextReviewAt: null },
            ],
            nextReviewAt: null,
            learningStatus: {
              in: [LearningStatus.LEARNING, LearningStatus.REVIEWING],
            },
          }),
        }),
      );
    },
  );

  it('uses the same owner-scoped past-or-null eligibility for today due count', async () => {
    query.mockResolvedValueOnce([{ count: 4 }]).mockResolvedValueOnce([]);
    const now = new Date('2026-08-03T00:00:00Z');

    await expect(
      repository.getDueRecommendations('owner', { limit: 2 }, now),
    ).resolves.toEqual({ dueVocabularyCount: 4, recommendedQuizzes: [] });

    expect(query).toHaveBeenCalledTimes(2);
    const countQuery = query.mock.calls[0][0] as Prisma.Sql;
    expect(countQuery.sql).toContain('uv.user_id = ?::uuid');
    expect(countQuery.sql).toContain('uv.next_review_at <= ?');
    expect(countQuery.sql).toContain('OR uv.next_review_at IS NULL');
    expect(countQuery.sql).not.toContain('uv.learning_status =');
    expect(countQuery.values).toEqual(
      expect.arrayContaining([
        'owner',
        LearningStatus.NEW,
        LearningStatus.LEARNING,
        LearningStatus.REVIEWING,
        now,
      ]),
    );
  });

  it('builds a bounded learner snapshot without personal or raw-answer data', async () => {
    const now = new Date('2026-08-08T00:00:00Z');
    vocabularyFindMany
      .mockResolvedValueOnce([reviewVocabulary])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    profileFindUnique.mockResolvedValue({ currentCefrLevel: CefrLevel.B1 });
    query.mockResolvedValue([
      {
        answerId: 'answer-1',
        userVocabularyId: reviewVocabulary.id,
        questionType: QuestionType.SELECT_WORD,
        skillDimension: null,
        errorType: null,
        isCorrect: false,
        responseTimeMs: 5_000,
        hintsUsed: 1,
        inferredReviewScore: 0,
        answeredAt: new Date('2026-08-07T00:00:00Z'),
      },
    ]);
    answerGroupBy
      .mockResolvedValueOnce([
        {
          skillDimension: ReviewSkillDimension.RECALL,
          _count: { _all: 4 },
          _avg: { responseTimeMs: 3_500 },
        },
      ])
      .mockResolvedValueOnce([
        {
          skillDimension: ReviewSkillDimension.RECALL,
          _count: { _all: 3 },
        },
      ]);

    const snapshot = await repository.getLearnerSnapshot('owner', 500, now, 7);

    expect(vocabularyFindMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({ take: 100 }),
    );
    expect(profileFindUnique).toHaveBeenCalledWith({
      where: { userId: 'owner' },
      select: { currentCefrLevel: true },
    });
    expect(answerGroupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        by: ['skillDimension'],
        where: expect.objectContaining({
          answeredAt: {
            gte: new Date('2026-08-01T00:00:00Z'),
            lte: now,
          },
          reviewSessionItem: {
            is: { reviewSession: { is: { userId: 'owner' } } },
          },
        }),
      }),
    );
    expect(snapshot).toMatchObject({
      currentCefrLevel: CefrLevel.B1,
      skillWindowDays: 7,
      skillAggregates: [
        {
          skillDimension: ReviewSkillDimension.RECALL,
          attemptCount: 4,
          correctCount: 3,
          accuracy: 0.75,
          averageResponseTimeMs: 3_500,
        },
      ],
      eligibleVocabulary: [
        {
          id: reviewVocabulary.id,
          overdueDurationMs: 7 * 24 * 60 * 60 * 1_000,
          lapseCount: 0,
          recentAttempts: [
            {
              answerId: 'answer-1',
              skillDimension: ReviewSkillDimension.RECALL,
              isCorrect: false,
            },
          ],
        },
      ],
    });
    expect(snapshot.eligibleVocabulary[0]).not.toHaveProperty('personalNote');
    expect(snapshot.eligibleVocabulary[0].recentAttempts[0]).not.toHaveProperty(
      'userAnswerText',
    );
  });

  it('reserves an AI call slot with one atomic owner-scoped update', async () => {
    sessionUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      repository.reserveAiCallSlot('owner', 'session', 6),
    ).resolves.toBe(true);
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'session',
        userId: 'owner',
        status: ReviewSessionStatus.IN_PROGRESS,
        aiCallCount: { lt: 6 },
      },
      data: { aiCallCount: { increment: 1 } },
    });
  });

  it('does not reserve an AI call slot after the atomic budget guard loses', async () => {
    sessionUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      repository.reserveAiCallSlot('owner', 'session', 6),
    ).resolves.toBe(false);
  });

  it('persists an owner-scoped AI decision in a short transaction', async () => {
    sessionFindFirst.mockResolvedValue({ id: 'session' });
    itemFindFirst.mockResolvedValue({ id: 'item' });
    answerFindFirst.mockResolvedValue({ id: 'answer' });
    decisionCreate.mockResolvedValue({ id: 'decision' });

    await expect(
      repository.persistAgentDecision('owner', {
        reviewSessionId: 'session',
        reviewSessionItemId: 'item',
        reviewAnswerId: 'answer',
        kind: ReviewDecisionKind.ANSWER_INTERVENTION,
        source: ReviewDecisionSource.AI,
        action: ReviewAgentAction.TEACH_AND_REQUEUE,
        skillDimension: ReviewSkillDimension.RECALL,
        errorType: ReviewErrorType.LOW_RECALL,
        confidence: 0.84,
        reasonCode: 'LOW_RECALL_EVIDENCE',
        stateSnapshot: { wordOrPhrase: 'engaging' },
        decisionPayload: { action: 'TEACH_AND_REQUEUE' },
        provider: 'GROQ',
        model: 'groq-model',
        promptVersion: 'review-answer-diagnosis-v1',
        latencyMs: 120,
      }),
    ).resolves.toEqual({ decision: { id: 'decision' }, created: true });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sessionFindFirst).toHaveBeenCalledWith({
      where: { id: 'session', userId: 'owner' },
      select: { id: true },
    });
    expect(answerFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'answer',
        reviewSessionItem: {
          is: { reviewSessionId: 'session', id: 'item' },
        },
      },
      select: { id: true },
    });
  });

  it('returns the existing owner-scoped decision after a duplicate constraint conflict', async () => {
    sessionFindFirst.mockResolvedValue({ id: 'session' });
    itemFindFirst.mockResolvedValue({ id: 'item' });
    answerFindFirst.mockResolvedValue({ id: 'answer' });
    decisionCreate.mockRejectedValue({ code: 'P2002' });
    decisionFindFirst.mockResolvedValue({ id: 'existing-decision' });

    const input = {
      reviewSessionId: 'session',
      reviewSessionItemId: 'item',
      reviewAnswerId: 'answer',
      kind: ReviewDecisionKind.ANSWER_INTERVENTION,
      source: ReviewDecisionSource.RULE,
      action: ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
      skillDimension: ReviewSkillDimension.RECALL,
      errorType: ReviewErrorType.UNKNOWN,
      confidence: null,
      reasonCode: 'AI_UNAVAILABLE',
      stateSnapshot: { wordOrPhrase: 'engaging' },
      decisionPayload: { action: 'REQUEUE_WITH_NEW_TYPE' },
      provider: null,
      model: null,
      promptVersion: 'review-agent-rule-v1',
      latencyMs: null,
    };

    await expect(
      repository.persistAgentDecision('owner', input),
    ).resolves.toEqual({
      decision: { id: 'existing-decision' },
      created: false,
    });
    expect(decisionFindFirst).toHaveBeenCalledWith({
      where: {
        reviewAnswerId: 'answer',
        kind: ReviewDecisionKind.ANSWER_INTERVENTION,
        reviewSession: { is: { userId: 'owner' } },
      },
    });
  });

  it('applies persisted feedback and a different cached AI retest in a second short transaction', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      sessionType: ReviewSessionType.DAILY_REVIEW,
      quizId: null,
      articleId: null,
      collectionId: null,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemFindFirst
      .mockResolvedValueOnce({
        id: 'item',
        userVocabularyId: 'vocabulary',
        retryCount: 1,
        quizQuestion: {
          id: 'fallback-question',
          articleSentenceTermId: 'term',
          questionType: QuestionType.SELECT_WORD,
        },
        userVocabulary: { savedCefrLevel: CefrLevel.B1 },
      })
      .mockResolvedValueOnce(null);
    answerFindFirst.mockResolvedValue({ id: 'answer' });
    questionFindFirst.mockResolvedValue({ id: 'ai-retest' });
    decisionCreate.mockResolvedValue({ id: 'decision' });
    itemFindMany.mockResolvedValue([
      { id: 'next-1', sequenceNumber: 2 },
      { id: 'next-2', sequenceNumber: 3 },
      { id: 'next-3', sequenceNumber: 4 },
      { id: 'item', sequenceNumber: 5 },
    ]);
    itemCount.mockResolvedValue(4);
    decisionFindFirst.mockResolvedValue(null);

    const result = await repository.applyAnswerAgentDecision('owner', {
      decision: {
        reviewSessionId: 'session',
        reviewSessionItemId: 'item',
        reviewAnswerId: 'answer',
        kind: ReviewDecisionKind.ANSWER_INTERVENTION,
        source: ReviewDecisionSource.AI,
        action: ReviewAgentAction.TEACH_AND_REQUEUE,
        skillDimension: ReviewSkillDimension.CONTEXT,
        errorType: ReviewErrorType.CONFUSABLE_WORD,
        confidence: 0.86,
        reasonCode: 'CONFUSABLE_CONTEXT',
        stateSnapshot: { attemptNumber: 1 },
        decisionPayload: {
          action: ReviewAgentAction.TEACH_AND_REQUEUE,
          microLesson: {
            title: 'Contrast the words',
            explanation: 'The two words fit different contexts.',
            example: 'Use the target word in this context.',
          },
          retest: {
            questionType: QuestionType.SELECT_CORRECT_CONTEXT,
            afterItems: 2,
          },
        },
        provider: 'GEMINI',
        model: 'gemini-model',
        promptVersion: 'review-answer-diagnosis-v1',
        latencyMs: 120,
      },
      originalQuestionType: QuestionType.SELECT_MEANING,
      expectedAttemptNumber: 1,
      preparedRetestQuestion: {
        userVocabularyId: 'vocabulary',
        quizQuestionId: 'ai-retest',
        articleSentenceTermId: 'term',
        difficultyCefr: CefrLevel.B1,
        questionType: QuestionType.SELECT_CORRECT_CONTEXT,
      },
    });

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'session',
          userId: 'owner',
          status: ReviewSessionStatus.IN_PROGRESS,
        }),
      }),
    );
    expect(answerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'answer',
          reviewSessionItemId: 'item',
          attemptNumber: 1,
          isCorrect: false,
        }),
      }),
    );
    expect(questionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'ai-retest',
          generationSource: QuestionGenerationSource.AI,
          questionType: QuestionType.SELECT_CORRECT_CONTEXT,
        }),
      }),
    );
    expect(answerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'answer' },
        data: {
          skillDimension: ReviewSkillDimension.CONTEXT,
          errorType: ReviewErrorType.CONFUSABLE_WORD,
        },
      }),
    );
    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item' },
        data: { quizQuestionId: 'ai-retest' },
      }),
    );
    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item' },
        data: { sequenceNumber: 4 },
      }),
    );
    expect(result.agentFeedback).toMatchObject({
      source: ReviewDecisionSource.AI,
      action: ReviewAgentAction.TEACH_AND_REQUEUE,
      errorType: ReviewErrorType.CONFUSABLE_WORD,
      retestAfterItems: 2,
    });
  });

  it('rejects a stale answer attempt before persisting the agent enhancement', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 2,
      quizQuestion: {
        id: 'fallback-question',
        articleSentenceTermId: 'term',
        questionType: QuestionType.SELECT_WORD,
      },
      userVocabulary: { savedCefrLevel: CefrLevel.B1 },
    });

    await expect(
      repository.applyAnswerAgentDecision('owner', {
        decision: {
          reviewSessionId: 'session',
          reviewSessionItemId: 'item',
          reviewAnswerId: 'answer',
          kind: ReviewDecisionKind.ANSWER_INTERVENTION,
          source: ReviewDecisionSource.RULE,
          action: ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
          skillDimension: ReviewSkillDimension.RECALL,
          errorType: ReviewErrorType.LOW_RECALL,
          confidence: null,
          reasonCode: 'DETERMINISTIC_REQUEUE',
          stateSnapshot: {},
          decisionPayload: {
            retest: { questionType: QuestionType.SELECT_WORD, afterItems: 3 },
          },
          provider: null,
          model: null,
          promptVersion: 'review-agent-rule-v1',
          latencyMs: null,
        },
        originalQuestionType: QuestionType.SELECT_MEANING,
        expectedAttemptNumber: 1,
        preparedRetestQuestion: null,
      }),
    ).rejects.toBeInstanceOf(ReviewAgentDecisionConflictError);
    expect(answerFindFirst).not.toHaveBeenCalled();
    expect(decisionCreate).not.toHaveBeenCalled();
  });

  it('selects collection review vocabulary only through that owned collection', async () => {
    sessionFindFirst.mockResolvedValue(null);
    collectionFindFirst.mockResolvedValue({ id: 'collection' });
    vocabularyFindMany
      .mockResolvedValueOnce([reviewVocabulary])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    questionFindMany.mockResolvedValue([
      {
        id: 'cached-question',
        articleSentenceTermId: reviewVocabulary.articleSentenceTermId,
        questionType: QuestionType.FILL_BLANK,
        generationSource: QuestionGenerationSource.AI,
        difficultyCefr: CefrLevel.B1,
        prompt: 'Complete the original sentence with the saved vocabulary.',
        blankSentence: 'A ___ here.',
        correctAnswerText: 'word',
        answerExplanation: null,
        isCaseSensitive: false,
        points: 1,
        options: [],
      },
    ]);
    sessionCreate.mockResolvedValue({
      id: 'collection-session',
      sessionType: ReviewSessionType.COLLECTION_REVIEW,
      quizId: null,
      articleId: null,
      collectionId: 'collection',
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemCreateMany.mockResolvedValue({ count: 1 });

    await repository.startSession(
      'owner',
      {
        sessionType: ReviewSessionType.COLLECTION_REVIEW,
        collectionId: 'collection',
        limit: 20,
      },
      new Date('2026-08-03T00:00:00Z'),
      [
        {
          userVocabularyId: reviewVocabulary.id,
          quizQuestionId: 'cached-question',
          articleSentenceTermId: reviewVocabulary.articleSentenceTermId,
          difficultyCefr: CefrLevel.B1,
          questionType: QuestionType.FILL_BLANK,
        },
      ],
    );

    expect(collectionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'collection', userId: 'owner' } }),
    );
    for (const call of vocabularyFindMany.mock.calls.slice(0, 3)) {
      expect(call[0].where).toEqual(
        expect.objectContaining({
          userId: 'owner',
          collectionItems: { some: { collectionId: 'collection' } },
        }),
      );
    }
    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userVocabularyId: reviewVocabulary.id,
          sequenceNumber: 1,
        }),
      ],
    });
  });

  it('reuses a compatible in-progress collection session without rematerializing items', async () => {
    collectionFindFirst.mockResolvedValue({ id: 'collection' });
    sessionFindFirst.mockResolvedValue({
      id: 'existing',
      sessionType: ReviewSessionType.COLLECTION_REVIEW,
      quizId: null,
      articleId: null,
      collectionId: 'collection',
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    itemFindFirst.mockResolvedValue(null);

    const result = await repository.startSession(
      'owner',
      {
        sessionType: ReviewSessionType.COLLECTION_REVIEW,
        collectionId: 'collection',
        limit: 20,
      },
      new Date(),
    );

    expect(collectionFindFirst).not.toHaveBeenCalled();
    expect(result?.session.id).toBe('existing');
    expect(vocabularyFindMany).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('rejects a collection source that is not owned by the user', async () => {
    sessionFindFirst.mockResolvedValue(null);
    collectionFindFirst.mockResolvedValue(null);

    await expect(
      repository.startSession(
        'owner',
        {
          sessionType: ReviewSessionType.COLLECTION_REVIEW,
          collectionId: 'foreign-collection',
          limit: 20,
        },
        new Date(),
      ),
    ).rejects.toBeInstanceOf(ReviewResourceNotFoundError);
    expect(collectionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'foreign-collection', userId: 'owner' },
      }),
    );
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('revalidates and attaches only the prepared AI question inside the start transaction', async () => {
    articleFindFirst.mockResolvedValue({ id: 'article' });
    sessionFindFirst.mockResolvedValue(null);
    vocabularyFindMany
      .mockResolvedValue([])
      .mockResolvedValueOnce([reviewVocabulary]);
    questionFindMany.mockResolvedValue([
      {
        id: 'prepared-ai-question',
        articleSentenceTermId: 'term',
        difficultyCefr: CefrLevel.B1,
        questionType: QuestionType.FILL_BLANK,
      },
    ]);
    sessionCreate.mockResolvedValue({
      id: 'article-session',
      sessionType: ReviewSessionType.ARTICLE_REVIEW,
      quizId: null,
      articleId: 'article',
      collectionId: null,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemCreateMany.mockResolvedValue({ count: 1 });

    await repository.startSession(
      'owner',
      {
        sessionType: ReviewSessionType.ARTICLE_REVIEW,
        articleId: 'article',
        limit: 20,
      },
      new Date('2026-08-03T00:00:00Z'),
      [
        {
          userVocabularyId: 'vocabulary',
          quizQuestionId: 'prepared-ai-question',
          articleSentenceTermId: 'term',
          difficultyCefr: CefrLevel.B1,
          questionType: QuestionType.FILL_BLANK,
        },
      ],
    );

    expect(articleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'article', status: ArticleStatus.PUBLISHED },
      }),
    );
    expect(questionFindMany).toHaveBeenCalledTimes(1);
    expect(questionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['prepared-ai-question'] },
          generationSource: QuestionGenerationSource.AI,
        }),
      }),
    );
    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userVocabularyId: 'vocabulary',
          quizQuestionId: 'prepared-ai-question',
        }),
      ],
    });
    expect(questionCreateManyAndReturn).not.toHaveBeenCalled();
    expect(optionCreateMany).not.toHaveBeenCalled();
  });

  it('omits an eligible candidate whose prepared AI question is unavailable', async () => {
    const target = {
      ...reviewVocabulary,
      learningStatus: LearningStatus.NEW,
      consecutiveCorrectReviews: 0,
      lastReviewScore: null,
    };
    const distractor = {
      ...reviewVocabulary,
      id: 'distractor',
      articleSentenceTermId: 'distractor-term',
      savedWordDisplay: 'different',
      savedLemma: 'different',
      savedMeaningVi: 'khác',
      savedContextSentence: 'A different term here.',
    };
    articleFindFirst.mockResolvedValue({ id: 'article' });
    sessionFindFirst.mockResolvedValue(null);
    vocabularyFindMany
      .mockResolvedValue([])
      .mockResolvedValueOnce([target, distractor]);
    questionFindMany.mockResolvedValue([
      {
        id: 'available-question',
        articleSentenceTermId: 'term',
        difficultyCefr: CefrLevel.B1,
        questionType: QuestionType.SELECT_MEANING,
      },
    ]);
    sessionCreate.mockResolvedValue({
      id: 'article-session',
      sessionType: ReviewSessionType.ARTICLE_REVIEW,
      quizId: null,
      articleId: 'article',
      collectionId: null,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemCreateMany.mockResolvedValue({ count: 1 });

    await repository.startSession(
      'owner',
      {
        sessionType: ReviewSessionType.ARTICLE_REVIEW,
        articleId: 'article',
        limit: 2,
      },
      new Date('2026-08-03T00:00:00Z'),
      [
        {
          userVocabularyId: 'vocabulary',
          quizQuestionId: 'available-question',
          articleSentenceTermId: 'term',
          difficultyCefr: CefrLevel.B1,
          questionType: QuestionType.SELECT_MEANING,
        },
        {
          userVocabularyId: 'distractor',
          quizQuestionId: 'missing-question',
          articleSentenceTermId: 'distractor-term',
          difficultyCefr: CefrLevel.B1,
          questionType: QuestionType.SELECT_MEANING,
        },
      ],
    );

    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userVocabularyId: 'vocabulary',
          quizQuestionId: 'available-question',
        }),
      ],
    });
    expect(questionCreateManyAndReturn).not.toHaveBeenCalled();
    expect(optionCreateMany).not.toHaveBeenCalled();
  });

  it('does not create a session when no prepared AI question remains usable', async () => {
    articleFindFirst.mockResolvedValue({ id: 'article' });
    sessionFindFirst.mockResolvedValue(null);
    vocabularyFindMany
      .mockResolvedValue([])
      .mockResolvedValueOnce([reviewVocabulary]);
    questionFindMany.mockResolvedValue([]);

    await expect(
      repository.startSession(
        'owner',
        {
          sessionType: ReviewSessionType.ARTICLE_REVIEW,
          articleId: 'article',
          limit: 1,
        },
        new Date('2026-08-03T00:00:00Z'),
        [
          {
            userVocabularyId: 'vocabulary',
            quizQuestionId: 'missing-question',
            articleSentenceTermId: 'term',
            difficultyCefr: CefrLevel.B1,
            questionType: QuestionType.SELECT_MEANING,
          },
        ],
      ),
    ).rejects.toBeInstanceOf(NoUsableReviewQuestionError);
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(itemCreateMany).not.toHaveBeenCalled();
  });

  it('selects SELECT_CORRECT_CONTEXT for a fixed quiz after low recent accuracy', async () => {
    quizFindFirst.mockResolvedValue({
      id: 'quiz',
      articleId: 'article',
      questions: [{ articleSentenceTermId: 'term' }],
    });
    sessionFindFirst.mockResolvedValue(null);
    vocabularyFindMany.mockResolvedValueOnce([reviewVocabulary]);
    query.mockResolvedValue([
      {
        userVocabularyId: 'vocabulary',
        questionType: QuestionType.SELECT_WORD,
        isCorrect: false,
      },
      {
        userVocabularyId: 'vocabulary',
        questionType: QuestionType.SELECT_MEANING,
        isCorrect: false,
      },
    ]);
    questionFindMany.mockResolvedValue([
      {
        id: 'meaning-question',
        articleSentenceTermId: 'term',
        questionType: QuestionType.SELECT_MEANING,
      },
      {
        id: 'context-question',
        articleSentenceTermId: 'term',
        questionType: QuestionType.SELECT_CORRECT_CONTEXT,
      },
    ]);
    sessionCreate.mockResolvedValue({
      id: 'quiz-session',
      sessionType: ReviewSessionType.QUIZ,
      quizId: 'quiz',
      articleId: 'article',
      collectionId: null,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemCreateMany.mockResolvedValue({ count: 1 });

    await repository.startSession(
      'owner',
      { sessionType: ReviewSessionType.QUIZ, quizId: 'quiz', limit: 1 },
      new Date('2026-08-03T00:00:00Z'),
    );

    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quizQuestionId: 'context-question' })],
    });
  });

  it('scopes session and answer progress by owner/session and selects first unanswered', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      quizId: 'quiz',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    itemFindFirst.mockResolvedValue(null);

    await repository.getSessionState('owner', 'session');

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session', userId: 'owner' } }),
    );
    expect(itemCount.mock.calls[1][0]).toMatchObject({
      where: {
        reviewSessionId: 'session',
        status: { in: ['COMPLETED', 'SKIPPED'] },
      },
    });
    expect(itemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewSessionId: 'session',
          status: 'PENDING',
        }),
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('restores persisted feedback only while its owner-scoped item is pending', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      sessionType: ReviewSessionType.DAILY_REVIEW,
      quizId: null,
      articleId: null,
      collectionId: null,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemCount.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    itemFindFirst.mockResolvedValue(null);
    decisionFindFirst.mockResolvedValue({
      source: ReviewDecisionSource.AI,
      action: ReviewAgentAction.TEACH_AND_REQUEUE,
      skillDimension: ReviewSkillDimension.CONTEXT,
      errorType: ReviewErrorType.CONFUSABLE_WORD,
      decisionPayload: {
        microLesson: {
          title: 'Economic or economical?',
          explanation: 'Economic relates to the economy.',
          example: 'The country faces economic pressure.',
        },
        retest: { questionType: QuestionType.FILL_BLANK, afterItems: 3 },
      },
    });

    await expect(
      repository.getSessionState('owner', 'session'),
    ).resolves.toMatchObject({
      agentFeedback: {
        source: ReviewDecisionSource.AI,
        skillDimension: ReviewSkillDimension.CONTEXT,
        errorType: ReviewErrorType.CONFUSABLE_WORD,
        retestAfterItems: 3,
      },
    });
    expect(decisionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reviewSessionId: 'session',
          kind: ReviewDecisionKind.ANSWER_INTERVENTION,
          reviewSessionItem: {
            is: { status: ReviewSessionItemStatus.PENDING },
          },
        },
      }),
    );
  });

  it('inserts answer and saved-vocabulary schedule in the same transaction', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      quizId: 'quiz',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 0,
      _count: { answers: 0 },
      quizQuestion: {
        id: 'question',
        articleSentenceTermId: 'term',
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
      },
    });
    vocabularyFindUnique.mockResolvedValue({
      id: 'vocabulary',
      learningStatus: LearningStatus.NEW,
      reviewIntervalDays: null,
      consecutiveCorrectReviews: 0,
      lapseCount: 0,
    });
    answerCreate.mockResolvedValue({ id: 'answer' });
    vocabularyUpdate.mockResolvedValue({ id: 'vocabulary' });

    const result = await repository.submitAnswer('owner', 'session', {
      reviewSessionItemId: 'item',
      quizQuestionId: 'question',
      selectedOptionId: 'option',
    });

    expect(answerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewSessionItemId: 'item',
          quizQuestionId: 'question',
          attemptNumber: 1,
          hintsUsed: 0,
          inferredReviewScore: 4,
          skillDimension: ReviewSkillDimension.RECOGNITION,
          isCorrect: true,
        }),
      }),
    );
    expect(vocabularyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vocabulary' },
        data: expect.objectContaining({
          learningStatus: LearningStatus.REVIEWING,
          reviewIntervalDays: 2,
          consecutiveCorrectReviews: 1,
          lastReviewScore: 4,
        }),
      }),
    );
    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          retryCount: 0,
          finalInferredScore: 4,
        }),
      }),
    );
    expect(result.sessionCompleted).toBe(true);
    expect(result).toMatchObject({
      inferredReviewScore: 4,
      willReturnLater: false,
      completionSummary: { score: 0, accuracy: 0 },
    });
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReviewSessionStatus.COMPLETED,
        }),
      }),
    );
  });

  it('keeps a failed item pending and scores a later correct retry as 2', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      quizId: 'quiz',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 1,
      _count: { answers: 1 },
      quizQuestion: {
        id: 'question',
        articleSentenceTermId: 'term',
        questionType: QuestionType.FILL_BLANK,
        correctAnswerText: 'Correct',
        answerExplanation: null,
        isCaseSensitive: false,
        points: 2,
        options: [],
      },
    });
    vocabularyFindUnique.mockResolvedValue({
      id: 'vocabulary',
      learningStatus: LearningStatus.LEARNING,
      reviewIntervalDays: 1,
      consecutiveCorrectReviews: 0,
      lapseCount: 1,
    });
    answerCreate.mockResolvedValue({ id: 'retry-answer' });
    vocabularyUpdate.mockResolvedValue({ id: 'vocabulary' });

    await repository.submitAnswer('owner', 'session', {
      reviewSessionItemId: 'item',
      quizQuestionId: 'question',
      userAnswerText: 'Correct',
    });

    expect(answerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptNumber: 2,
          inferredReviewScore: 2,
          isCorrect: true,
        }),
      }),
    );
    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          retryCount: 1,
          finalInferredScore: 2,
        }),
      }),
    );
    expect(vocabularyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewIntervalDays: 1,
          consecutiveCorrectReviews: 1,
          lastReviewScore: 2,
        }),
      }),
    );
  });

  it('does not requeue the same question type when no alternate question is cached', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      quizId: 'quiz',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst
      .mockResolvedValueOnce({
        id: 'item',
        userVocabularyId: 'vocabulary',
        retryCount: 0,
        sequenceNumber: 1,
        _count: { answers: 0 },
        quizQuestion: {
          id: 'question',
          articleSentenceTermId: 'term',
          questionType: QuestionType.SELECT_MEANING,
          correctAnswerText: null,
          answerExplanation: null,
          isCaseSensitive: false,
          points: 2,
          options: [
            {
              id: 'correct-option',
              optionText: 'Correct',
              isCorrect: true,
              explanation: null,
            },
            {
              id: 'wrong-option',
              optionText: 'Wrong',
              isCorrect: false,
              explanation: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: 'item',
        userVocabularyId: 'vocabulary',
        retryCount: 1,
        quizQuestion: {
          id: 'question',
          articleSentenceTermId: 'term',
          questionType: QuestionType.SELECT_MEANING,
          prompt: 'Choose the meaning',
          blankSentence: null,
          points: 2,
          displayOrder: 1,
          options: [
            { id: 'correct-option', optionText: 'Correct', displayOrder: 1 },
            { id: 'wrong-option', optionText: 'Wrong', displayOrder: 2 },
          ],
        },
      });
    vocabularyFindUnique.mockResolvedValue({
      ...reviewVocabulary,
      learningStatus: LearningStatus.REVIEWING,
      nextReviewAt: new Date(),
      reviewIntervalDays: 12,
      consecutiveCorrectReviews: 3,
      lapseCount: 4,
    });
    questionFindMany.mockResolvedValue([]);
    itemFindMany.mockResolvedValueOnce([
      { id: 'next-1', sequenceNumber: 2 },
      { id: 'next-2', sequenceNumber: 3 },
      { id: 'next-3', sequenceNumber: 4 },
    ]);
    itemCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    answerCreate.mockResolvedValue({ id: 'failed-answer' });
    vocabularyUpdate.mockResolvedValue({ id: 'vocabulary' });

    const result = await repository.submitAnswer('owner', 'session', {
      reviewSessionItemId: 'item',
      quizQuestionId: 'question',
      selectedOptionId: 'wrong-option',
      hintsUsed: 2,
      responseTimeMs: 45_000,
    });

    expect(answerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptNumber: 1,
          hintsUsed: 2,
          inferredReviewScore: 0,
          isCorrect: false,
        }),
      }),
    );
    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          retryCount: 0,
          finalInferredScore: 0,
        }),
      }),
    );
    expect(questionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          questionType: { not: QuestionType.SELECT_MEANING },
        }),
      }),
    );
    expect(questionFindMany).toHaveBeenCalledTimes(2);
    expect(questionFindMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          generationSource: QuestionGenerationSource.AI,
          questionType: {
            in: expect.not.arrayContaining([QuestionType.SELECT_MEANING]),
          },
        }),
      }),
    );
    expect(vocabularyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          learningStatus: LearningStatus.LEARNING,
          reviewIntervalDays: 1,
          consecutiveCorrectReviews: 0,
          lapseCount: 5,
          lastReviewScore: 0,
        }),
      }),
    );
    expect(result).toMatchObject({
      sessionCompleted: true,
      willReturnLater: false,
    });
    expect(result).not.toHaveProperty('diagnosisSnapshot');
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('completes and schedules tomorrow after the second incorrect attempt', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      sessionType: ReviewSessionType.DAILY_REVIEW,
      quizId: null,
      articleId: null,
      collectionId: null,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 1,
      sequenceNumber: 4,
      _count: { answers: 1 },
      quizQuestion: {
        id: 'retry-question',
        articleSentenceTermId: 'term',
        questionType: QuestionType.FILL_BLANK,
        correctAnswerText: 'word',
        answerExplanation: null,
        isCaseSensitive: false,
        points: 1,
        options: [],
      },
    });
    vocabularyFindUnique.mockResolvedValue({
      ...reviewVocabulary,
      learningStatus: LearningStatus.LEARNING,
      nextReviewAt: new Date('2026-08-04T00:00:00Z'),
      reviewIntervalDays: 1,
      consecutiveCorrectReviews: 0,
      lapseCount: 1,
    });
    answerCreate.mockResolvedValue({ id: 'second-failure' });
    vocabularyUpdate.mockResolvedValue({ id: 'vocabulary' });

    const result = await repository.submitAnswer('owner', 'session', {
      reviewSessionItemId: 'item',
      quizQuestionId: 'retry-question',
      userAnswerText: 'wrong',
    });

    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReviewSessionItemStatus.COMPLETED,
          retryCount: 1,
          finalInferredScore: 0,
        }),
      }),
    );
    expect(vocabularyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          learningStatus: LearningStatus.LEARNING,
          reviewIntervalDays: 1,
          consecutiveCorrectReviews: 0,
          lastReviewScore: 0,
        }),
      }),
    );
    expect(result.sessionCompleted).toBe(true);
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReviewSessionStatus.COMPLETED,
        }),
      }),
    );
    expect(questionFindMany).not.toHaveBeenCalled();
  });

  it('selects the most recent active session for the authenticated owner', async () => {
    sessionFindFirst.mockResolvedValue(null);

    await expect(repository.getActiveSessionState('owner')).resolves.toBeNull();

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'owner',
          status: ReviewSessionStatus.IN_PROGRESS,
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('rejects stale or duplicate item submissions before creating an answer', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst.mockResolvedValue({
      id: 'active-item',
      userVocabularyId: 'vocabulary',
      retryCount: 0,
      sequenceNumber: 1,
      _count: { answers: 0 },
      quizQuestion: { id: 'active-question' },
    });

    await expect(
      repository.submitAnswer('owner', 'session', {
        reviewSessionItemId: 'already-submitted-item',
        quizQuestionId: 'active-question',
        userAnswerText: 'answer',
      }),
    ).rejects.toBeInstanceOf(ReviewSubmissionConflictError);
    expect(answerCreate).not.toHaveBeenCalled();
  });

  it('rejects inconsistent server-side attempt history', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 0,
      sequenceNumber: 1,
      _count: { answers: 1 },
      quizQuestion: { id: 'question' },
    });

    await expect(
      repository.submitAnswer('owner', 'session', {
        reviewSessionItemId: 'item',
        quizQuestionId: 'question',
        userAnswerText: 'answer',
      }),
    ).rejects.toBeInstanceOf(ReviewSubmissionConflictError);
    expect(answerCreate).not.toHaveBeenCalled();
  });

  it('maps the database attempt uniqueness guard to a duplicate conflict', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: null,
      retryCount: 0,
      sequenceNumber: 1,
      _count: { answers: 0 },
      quizQuestion: {
        id: 'question',
        questionType: QuestionType.SELECT_MEANING,
        correctAnswerText: null,
        answerExplanation: null,
        isCaseSensitive: false,
        points: 1,
        options: [
          {
            id: 'option',
            optionText: 'Correct',
            isCorrect: true,
            explanation: null,
          },
        ],
      },
    });
    answerCreate.mockRejectedValue({ code: 'P2002' });

    await expect(
      repository.submitAnswer('owner', 'session', {
        reviewSessionItemId: 'item',
        quizQuestionId: 'question',
        selectedOptionId: 'option',
      }),
    ).rejects.toBeInstanceOf(ReviewSubmissionConflictError);
    expect(itemUpdate).not.toHaveBeenCalled();
    expect(vocabularyUpdate).not.toHaveBeenCalled();
  });

  it('skips, reschedules, and completes the session in one transaction', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      sessionType: ReviewSessionType.DAILY_REVIEW,
      quizId: null,
      articleId: null,
      collectionId: null,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date('2026-08-03T00:00:00Z'),
      completedAt: null,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 0,
      _count: { answers: 0 },
      quizQuestion: { id: 'question' },
    });
    vocabularyFindUnique.mockResolvedValue(reviewVocabulary);
    vocabularyUpdate.mockResolvedValue({ id: 'vocabulary' });
    itemFindMany.mockResolvedValue([
      { quizQuestion: { points: 1 }, answers: [] },
    ]);

    const result = await repository.skipItem('owner', 'session', {
      reviewSessionItemId: 'item',
      quizQuestionId: 'question',
    });

    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item' },
        data: expect.objectContaining({
          status: ReviewSessionItemStatus.SKIPPED,
          finalInferredScore: 0,
        }),
      }),
    );
    expect(vocabularyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastReviewScore: 0 }),
      }),
    );
    expect(answerCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      inferredReviewScore: 0,
      sessionCompleted: true,
      completionSummary: { score: 0, totalPoints: 1, accuracy: 0 },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
});
