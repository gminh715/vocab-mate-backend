/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { Prisma } from '../../../../generated/prisma/client';
import {
  CefrLevel,
  LearningStatus,
  ReviewQuestionGenerationSource,
  QuestionType,
  ReviewAgentAction,
  ReviewDecisionKind,
  ReviewDecisionSource,
  ReviewErrorType,
  ReviewGoal,
  ReviewSessionItemStatus,
  ReviewSessionStatus,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../../src/database/prisma.service';
import { REVIEW_QUESTION_PROMPT_VERSION } from '../../../../src/modules/ai/ai.contracts';
import { QuestionSelectionService } from '../../../../src/modules/reviews/services/question-selection.service';
import {
  ReviewSessionsRepository,
  ReviewSubmissionConflictError,
} from '../../../../src/modules/reviews/repositories/review-sessions.repository';
import {
  InvalidReviewAgentDecisionRelationshipError,
  ReviewAgentDecisionConflictError,
  ReviewAgentRepository,
} from '../../../../src/modules/reviews/repositories/review-agent.repository';
import { ReviewQuestionsRepository } from '../../../../src/modules/reviews/repositories/review-questions.repository';

describe('ReviewSessionsRepository', () => {
  const query = jest.fn();
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
  const itemUpdateMany = jest.fn();
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
    reviewSession: {
      findFirst: sessionFindFirst,
      create: sessionCreate,
      update: sessionUpdate,
      updateMany: sessionUpdateMany,
    },
    reviewQuestion: {
      findFirst: questionFindFirst,
      findMany: questionFindMany,
      create: questionCreate,
      createManyAndReturn: questionCreateManyAndReturn,
    },
    reviewQuestionOption: { createMany: optionCreateMany },
    reviewSessionItem: {
      findFirst: itemFindFirst,
      findMany: itemFindMany,
      createMany: itemCreateMany,
      update: itemUpdate,
      updateMany: itemUpdateMany,
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
  let repository: ReviewSessionsRepository;
  let agentRepository: ReviewAgentRepository;
  let questionsRepository: ReviewQuestionsRepository;
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
      status: ReviewSessionStatus.COMPLETED,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    const module = await Test.createTestingModule({
      providers: [
        ReviewSessionsRepository,
        ReviewAgentRepository,
        ReviewQuestionsRepository,
        QuestionSelectionService,
        {
          provide: PrismaService,
          useValue: {
            reviewSession: {
              findFirst: sessionFindFirst,
              updateMany: sessionUpdateMany,
            },
            reviewQuestion: {
              count: questionCount,
              findFirst: questionFindFirst,
              findMany: questionFindMany,
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
    repository = module.get(ReviewSessionsRepository);
    agentRepository = module.get(ReviewAgentRepository);
    questionsRepository = module.get(ReviewQuestionsRepository);
  });

  it('loads bounded recent response-time evidence for daily planning', async () => {
    query.mockResolvedValueOnce([
      { attemptCount: 6, averageResponseTimeMs: 31_500 },
    ]);

    await expect(
      repository.getRecentReviewTimingStats(
        '11111111-1111-4111-8111-111111111111',
        new Date('2026-08-09T00:00:00Z'),
      ),
    ).resolves.toEqual({
      attemptCount: 6,
      averageResponseTimeMs: 31_500,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('filters recent response-time evidence by the requested skill dimension', async () => {
    query.mockResolvedValueOnce([
      { attemptCount: 4, averageResponseTimeMs: 44_000 },
    ]);

    await expect(
      repository.getRecentReviewTimingStats(
        '11111111-1111-4111-8111-111111111111',
        new Date('2026-08-09T00:00:00Z'),
        ReviewSkillDimension.SPELLING,
      ),
    ).resolves.toEqual({
      attemptCount: 4,
      averageResponseTimeMs: 44_000,
    });
    const statement = query.mock.calls[0][0] as Prisma.Sql;
    expect(statement.strings.join(' ')).toContain('answer.skill_dimension');
    expect(statement.values).toContain(ReviewSkillDimension.SPELLING);
  });

  it('builds a deterministic completed summary from every persisted skill attempt', async () => {
    const completedAt = new Date('2026-08-09T02:00:00Z');
    const question = {
      id: 'question',
      articleSentenceTermId: 'term',
      questionType: QuestionType.FILL_BLANK,
      prompt: 'Complete the sentence.',
      correctAnswerText: 'economical',
      answerExplanation: 'Economical means avoiding waste.',
      isCaseSensitive: false,
      points: 1,
      displayOrder: 1,
      options: [],
    };
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      targetDurationMinutes: 10,
      reviewGoal: ReviewGoal.RECALL,
      plannedItemCount: 1,
      planSummary: 'Practice recall.',
      status: ReviewSessionStatus.COMPLETED,
      startedAt: new Date('2026-08-09T01:55:00Z'),
      completedAt,
      items: [
        {
          userVocabulary: {
            id: 'vocabulary',
            savedWordDisplay: 'economical',
            savedMeaningVi: 'tiết kiệm',
            savedExplanation: 'Uses resources carefully.',
          },
          reviewQuestion: question,
          answers: [
            {
              selectedOptionId: null,
              userAnswerText: 'economical',
              isCorrect: true,
              skillDimension: ReviewSkillDimension.RECALL,
              errorType: null,
              answeredAt: completedAt,
              reviewQuestion: question,
            },
            {
              selectedOptionId: null,
              userAnswerText: 'economic',
              isCorrect: false,
              skillDimension: ReviewSkillDimension.RECALL,
              errorType: ReviewErrorType.CONFUSABLE_WORD,
              answeredAt: new Date('2026-08-09T01:58:00Z'),
              reviewQuestion: question,
            },
          ],
        },
      ],
    });

    await expect(
      repository.getCompletedResult('owner', 'session'),
    ).resolves.toMatchObject({
      result: { accuracy: 1, correctCount: 1 },
      answers: [{ isCorrect: true, correctAnswer: 'economical' }],
      skillBreakdown: [
        {
          skillDimension: ReviewSkillDimension.RECALL,
          attempts: 2,
          correct: 1,
          accuracy: 0.5,
        },
      ],
      coachSummary: {
        strengths: [],
        focusNext: [ReviewSkillDimension.RECALL],
        source: ReviewDecisionSource.RULE,
      },
      wordsToRevisit: [
        {
          userVocabularyId: 'vocabulary',
          wordOrPhrase: 'economical',
          meaningVi: 'tiết kiệm',
          skillDimension: ReviewSkillDimension.RECALL,
          errorType: ReviewErrorType.CONFUSABLE_WORD,
          recoveredInSession: true,
        },
      ],
    });
  });

  it('persists an AI question and its options atomically with AI provenance', async () => {
    questionCreate.mockResolvedValue({ id: 'created-ai' });

    await expect(
      questionsRepository.cacheAiQuestion({
        articleSentenceTermId: 'term',
        questionType: QuestionType.SELECT_MEANING,
        generationSource: ReviewQuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
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
        generationSource: ReviewQuestionGenerationSource.AI,
        options: {
          create: [
            expect.objectContaining({
              generationSource: ReviewQuestionGenerationSource.AI,
              isCorrect: true,
            }),
            expect.objectContaining({
              generationSource: ReviewQuestionGenerationSource.AI,
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
      questionsRepository.cacheAiQuestion({
        articleSentenceTermId: 'term',
        questionType: QuestionType.FILL_BLANK,
        generationSource: ReviewQuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
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

  it('looks up a cached AI question with the complete active cache scope', async () => {
    questionFindFirst.mockResolvedValue({ id: 'cached-question' });

    await expect(
      questionsRepository.findCachedAiQuestion(
        'term',
        CefrLevel.B1,
        QuestionType.FILL_BLANK,
      ),
    ).resolves.toEqual({ id: 'cached-question' });

    expect(questionFindFirst).toHaveBeenCalledWith({
      where: {
        articleSentenceTermId: 'term',
        difficultyCefr: CefrLevel.B1,
        questionType: QuestionType.FILL_BLANK,
        generationSource: ReviewQuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        isActive: true,
      },
      select: { id: true },
    });
  });

  it('selects the highest-preference cached AI question independently of query order', async () => {
    questionFindMany.mockResolvedValue([
      {
        id: 'select-word',
        articleSentenceTermId: 'term',
        difficultyCefr: CefrLevel.B1,
        questionType: QuestionType.SELECT_WORD,
      },
      {
        id: 'fill-blank',
        articleSentenceTermId: 'term',
        difficultyCefr: CefrLevel.B1,
        questionType: QuestionType.FILL_BLANK,
      },
    ]);

    await expect(
      questionsRepository.findPreferredCachedAiQuestion(
        'vocabulary',
        'term',
        CefrLevel.B1,
        [QuestionType.FILL_BLANK, QuestionType.SELECT_WORD],
      ),
    ).resolves.toEqual({
      userVocabularyId: 'vocabulary',
      reviewQuestionId: 'fill-blank',
      articleSentenceTermId: 'term',
      difficultyCefr: CefrLevel.B1,
      questionType: QuestionType.FILL_BLANK,
    });
    expect(questionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          articleSentenceTermId: 'term',
          difficultyCefr: CefrLevel.B1,
          questionType: {
            in: [QuestionType.FILL_BLANK, QuestionType.SELECT_WORD],
          },
          generationSource: ReviewQuestionGenerationSource.AI,
          generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
          isActive: true,
        }),
      }),
    );
  });

  it('reuses an existing cache entry instead of inserting another question', async () => {
    questionFindFirst.mockResolvedValue({ id: 'existing-ai' });

    await expect(
      questionsRepository.cacheAiQuestion({
        articleSentenceTermId: 'term',
        questionType: QuestionType.FILL_BLANK,
        generationSource: ReviewQuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        difficultyCefr: CefrLevel.B1,
        prompt: 'Complete the sentence.',
        blankSentence: 'A ___ here.',
        correctAnswerText: 'word',
        answerExplanation: null,
        isCaseSensitive: false,
        points: 1,
        displayOrder: 1,
        isActive: true,
        options: [],
      }),
    ).resolves.toEqual({ id: 'existing-ai' });
    expect(questionCreate).not.toHaveBeenCalled();
  });

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
        generationSource: ReviewQuestionGenerationSource.AI,
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
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemCreateMany.mockResolvedValue({ count: 3 });

    await repository.startSession(
      'user',
      { limit: 3 },
      new Date('2026-08-03T00:00:00Z'),
      ['overdue', 'unscheduled', 'new'].map((suffix) => ({
        userVocabularyId: suffix,
        reviewQuestionId: `cached-${suffix}`,
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

      const candidates =
        await questionsRepository.getAiQuestionGenerationCandidates(
          'owner',
          { limit: 1 },
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

  it('balances generated question types and only accepts the current prompt cache', async () => {
    const vocabularies = Array.from({ length: 4 }, (_, index) => ({
      ...reviewVocabulary,
      id: `new-${index + 1}`,
      articleSentenceTermId: `term-${index + 1}`,
      learningStatus: LearningStatus.NEW,
      nextReviewAt: null,
      consecutiveCorrectReviews: 0,
      lastReviewScore: null,
    }));
    sessionFindFirst.mockResolvedValue(null);
    vocabularyFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(vocabularies);
    questionFindMany.mockResolvedValue(
      vocabularies.map((vocabulary, index) => ({
        id: `meaning-cache-${index + 1}`,
        articleSentenceTermId: vocabulary.articleSentenceTermId,
        difficultyCefr: CefrLevel.B1,
        questionType: QuestionType.SELECT_MEANING,
      })),
    );

    const candidates =
      await questionsRepository.getAiQuestionGenerationCandidates(
        'owner',
        {
          limit: 4,
          reviewGoal: ReviewGoal.BALANCED,
        },
        new Date('2026-08-03T00:00:00Z'),
      );

    expect(candidates.map(({ questionType }) => questionType)).toEqual([
      QuestionType.SELECT_MEANING,
      QuestionType.SELECT_WORD,
      QuestionType.FILL_BLANK,
      QuestionType.SELECT_CORRECT_CONTEXT,
    ]);
    expect(
      candidates.map(
        ({ cachedQuestion }) => cachedQuestion?.reviewQuestionId ?? null,
      ),
    ).toEqual(['meaning-cache-1', null, null, null]);
    expect(questionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          generationSource: ReviewQuestionGenerationSource.AI,
          generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        }),
      }),
    );
  });

  it('uses the same owner-scoped past-or-null eligibility for today due count', async () => {
    query.mockResolvedValueOnce([{ count: 4 }]);
    const now = new Date('2026-08-03T00:00:00Z');

    await expect(
      repository.getDueRecommendations('owner', now),
    ).resolves.toEqual({ dueVocabularyCount: 4 });

    expect(query).toHaveBeenCalledTimes(1);
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

  it('builds a bounded owner-scoped planning snapshot for only the pending session items', async () => {
    const now = new Date('2026-08-08T00:00:00Z');
    sessionFindFirst.mockResolvedValue({ id: 'session' });
    itemFindMany.mockResolvedValue([
      { id: 'item-1', userVocabulary: reviewVocabulary },
    ]);
    profileFindUnique.mockResolvedValue({ currentCefrLevel: CefrLevel.B1 });
    query.mockResolvedValue([]);

    await expect(
      repository.getSessionPlanningSnapshot('owner', 'session', now, 14),
    ).resolves.toMatchObject({
      currentCefrLevel: CefrLevel.B1,
      skillWindowDays: 14,
      candidates: [
        {
          reviewSessionItemId: 'item-1',
          alias: 'v1',
          vocabulary: {
            id: 'vocabulary',
            savedWordDisplay: 'word',
            overdueDurationMs: 7 * 24 * 60 * 60 * 1_000,
            recentAttempts: [],
          },
        },
      ],
    });
    expect(sessionFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'session',
        userId: 'owner',
        status: ReviewSessionStatus.IN_PROGRESS,
        planSummary: null,
      },
      select: { id: true },
    });
    expect(itemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reviewSessionId: 'session',
          status: ReviewSessionItemStatus.PENDING,
          userVocabularyId: { not: null },
        },
        take: 100,
      }),
    );
  });

  it('reserves an AI call slot with one atomic owner-scoped update', async () => {
    sessionUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      agentRepository.reserveCall('owner', 'session', 6),
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

  it('reserves a question-generation call through the question cache boundary', async () => {
    sessionUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      questionsRepository.reserveGenerationCall('owner', 'session', 6),
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
      agentRepository.reserveCall('owner', 'session', 6),
    ).resolves.toBe(false);
  });

  it('keeps concurrent AI reservations within the maximum through the atomic guard', async () => {
    let remainingReservations = 1;
    sessionUpdateMany.mockImplementation(() =>
      Promise.resolve({ count: remainingReservations-- > 0 ? 1 : 0 }),
    );

    await expect(
      Promise.all([
        agentRepository.reserveCall('owner', 'session', 6),
        agentRepository.reserveCall('owner', 'session', 6),
      ]),
    ).resolves.toEqual([true, false]);
    expect(sessionUpdateMany).toHaveBeenCalledTimes(2);
    expect(sessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ aiCallCount: { lt: 6 } }),
      }),
    );
  });

  it('rejects invalid AI call maxima before issuing a reservation update', async () => {
    await expect(
      agentRepository.reserveCall('owner', 'session', 0),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      agentRepository.reserveDiagnosisCall('owner', 'session', 6, 0),
    ).rejects.toBeInstanceOf(RangeError);
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it('reserves a diagnosis slot against both atomic call budgets', async () => {
    sessionUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      agentRepository.reserveDiagnosisCall('owner', 'session', 6, 4),
    ).resolves.toBe(true);
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'session',
        userId: 'owner',
        status: ReviewSessionStatus.IN_PROGRESS,
        aiCallCount: { lt: 6 },
        aiDiagnosisCallCount: { lt: 4 },
      },
      data: {
        aiCallCount: { increment: 1 },
        aiDiagnosisCallCount: { increment: 1 },
      },
    });
  });

  it('persists an owner-scoped AI decision in a short transaction', async () => {
    sessionFindFirst.mockResolvedValue({ id: 'session' });
    itemFindFirst.mockResolvedValue({ id: 'item' });
    answerFindFirst.mockResolvedValue({ id: 'answer' });
    decisionCreate.mockResolvedValue({ id: 'decision' });

    await expect(
      agentRepository.persist('owner', {
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

  it('atomically persists a session plan and safely reorders the owned pending items', async () => {
    const startedAt = new Date('2026-08-08T00:00:00Z');
    sessionFindFirst
      .mockResolvedValueOnce({
        id: 'session',
        planSummary: null,
        status: ReviewSessionStatus.IN_PROGRESS,
        startedAt,
        completedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'session',
        planSummary: 'Prioritize the overdue item.',
        status: ReviewSessionStatus.IN_PROGRESS,
        startedAt,
        completedAt: null,
      });
    itemFindMany.mockResolvedValue([
      { id: 'item-1', sequenceNumber: 1 },
      { id: 'item-2', sequenceNumber: 2 },
    ]);
    sessionUpdateMany.mockResolvedValue({ count: 1 });
    decisionCreate.mockResolvedValue({ id: 'decision' });
    itemCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    itemFindFirst.mockResolvedValue(null);
    decisionFindFirst.mockResolvedValue(null);
    const decision = {
      reviewSessionId: 'session',
      reviewSessionItemId: null,
      reviewAnswerId: null,
      kind: ReviewDecisionKind.SESSION_PLAN,
      source: ReviewDecisionSource.AI,
      action: null,
      skillDimension: null,
      errorType: null,
      confidence: 0.9,
      reasonCode: 'AI_PLAN_ACCEPTED',
      stateSnapshot: { candidates: [{ alias: 'v1' }, { alias: 'v2' }] },
      decisionPayload: {
        orderedCandidateAliases: ['v2', 'v1'],
        summary: 'Prioritize the overdue item.',
      },
      provider: 'GEMINI',
      model: 'gemini-model',
      promptVersion: 'review-agent-v1',
      latencyMs: 80,
    };

    await expect(
      agentRepository.applySessionPlan('owner', {
        decision,
        targetDurationMinutes: 10,
        reviewGoal: ReviewGoal.BALANCED,
        plannedItemCount: 2,
        planSummary: 'Prioritize the overdue item.',
        agentVersion: 'review-agent-v1',
        orderedSessionItemIds: ['item-2', 'item-1'],
      }),
    ).resolves.toMatchObject({
      session: { id: 'session', planSummary: 'Prioritize the overdue item.' },
      totalQuestions: 2,
      answeredCount: 0,
    });
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'session',
        userId: 'owner',
        status: ReviewSessionStatus.IN_PROGRESS,
        planSummary: null,
      },
      data: {
        targetDurationMinutes: 10,
        reviewGoal: ReviewGoal.BALANCED,
        plannedItemCount: 2,
        planSummary: 'Prioritize the overdue item.',
        agentVersion: 'review-agent-v1',
      },
    });
    expect(itemUpdateMany).toHaveBeenCalledWith({
      where: { reviewSessionId: 'session' },
      data: { sequenceNumber: { increment: 3 } },
    });
    expect(itemUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'item-2' },
      data: { sequenceNumber: 1 },
      select: { id: true },
    });
    expect(itemUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 'item-1' },
      data: { sequenceNumber: 2 },
      select: { id: true },
    });
    expect(decisionCreate).toHaveBeenCalledWith({ data: decision });
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

    await expect(agentRepository.persist('owner', input)).resolves.toEqual({
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
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemFindFirst
      .mockResolvedValueOnce({
        id: 'item',
        userVocabularyId: 'vocabulary',
        retryCount: 1,
        reviewQuestion: {
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

    const result = await agentRepository.applyAnswerDecision('owner', {
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
        reviewQuestionId: 'ai-retest',
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
          generationSource: ReviewQuestionGenerationSource.AI,
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
        data: { reviewQuestionId: 'ai-retest' },
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

  it('persists a non-requeue intervention without replacing or moving the deterministic retest', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      completedAt: null,
    });
    itemFindFirst
      .mockResolvedValueOnce({
        id: 'item',
        userVocabularyId: 'vocabulary',
        retryCount: 1,
        reviewQuestion: {
          id: 'fallback-question',
          articleSentenceTermId: 'term',
          questionType: QuestionType.SELECT_WORD,
        },
        userVocabulary: { savedCefrLevel: CefrLevel.B1 },
      })
      .mockResolvedValueOnce(null);
    answerFindFirst.mockResolvedValue({ id: 'answer' });
    decisionCreate.mockResolvedValue({ id: 'decision' });

    const result = await agentRepository.applyAnswerDecision('owner', {
      decision: {
        reviewSessionId: 'session',
        reviewSessionItemId: 'item',
        reviewAnswerId: 'answer',
        kind: ReviewDecisionKind.ANSWER_INTERVENTION,
        source: ReviewDecisionSource.AI,
        action: ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS,
        skillDimension: ReviewSkillDimension.RECALL,
        errorType: ReviewErrorType.LOW_RECALL,
        confidence: 0.82,
        reasonCode: 'NEEDS_FUTURE_FOCUS',
        stateSnapshot: { attemptNumber: 1 },
        decisionPayload: {
          action: ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS,
          microLesson: null,
          retest: null,
        },
        provider: 'GEMINI',
        model: 'gemini-model',
        promptVersion: 'review-answer-diagnosis-v1',
        latencyMs: 90,
      },
      originalQuestionType: QuestionType.SELECT_MEANING,
      expectedAttemptNumber: 1,
      preparedRetestQuestion: null,
    });

    expect(decisionCreate).toHaveBeenCalledTimes(1);
    expect(answerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          skillDimension: ReviewSkillDimension.RECALL,
          errorType: ReviewErrorType.LOW_RECALL,
        },
      }),
    );
    expect(questionFindFirst).not.toHaveBeenCalled();
    expect(itemUpdate).not.toHaveBeenCalled();
    expect(itemFindMany).not.toHaveBeenCalled();
    expect(result.agentFeedback).toMatchObject({
      action: ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS,
      skillDimension: ReviewSkillDimension.RECALL,
    });
    expect(result.agentFeedback).not.toHaveProperty('retestAfterItems');
  });

  it('rejects an action and retest payload that describe different interventions', async () => {
    await expect(
      agentRepository.applyAnswerDecision('owner', {
        decision: {
          reviewSessionId: 'session',
          reviewSessionItemId: 'item',
          reviewAnswerId: 'answer',
          kind: ReviewDecisionKind.ANSWER_INTERVENTION,
          source: ReviewDecisionSource.AI,
          action: ReviewAgentAction.CONTINUE,
          skillDimension: ReviewSkillDimension.RECOGNITION,
          errorType: ReviewErrorType.CARELESS_ERROR,
          confidence: 0.8,
          reasonCode: 'CONTINUE_AFTER_ERROR',
          stateSnapshot: {},
          decisionPayload: {
            action: ReviewAgentAction.CONTINUE,
            microLesson: null,
            retest: {
              questionType: QuestionType.SELECT_WORD,
              afterItems: 3,
            },
          },
          provider: 'GEMINI',
          model: 'gemini-model',
          promptVersion: 'review-answer-diagnosis-v1',
          latencyMs: 80,
        },
        originalQuestionType: QuestionType.SELECT_MEANING,
        expectedAttemptNumber: 1,
        preparedRetestQuestion: null,
      }),
    ).rejects.toBeInstanceOf(InvalidReviewAgentDecisionRelationshipError);
    expect(sessionFindFirst).not.toHaveBeenCalled();
    expect(decisionCreate).not.toHaveBeenCalled();
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
      reviewQuestion: {
        id: 'fallback-question',
        articleSentenceTermId: 'term',
        questionType: QuestionType.SELECT_WORD,
      },
      userVocabulary: { savedCefrLevel: CefrLevel.B1 },
    });

    await expect(
      agentRepository.applyAnswerDecision('owner', {
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
            action: ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
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

  it('scopes session and answer progress by owner/session and selects first unanswered', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      planSummary: 'Review recall first, then reinforce meaning in context.',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    itemFindFirst.mockResolvedValue(null);

    const state = await repository.getSessionState('owner', 'session');

    expect(sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session', userId: 'owner' },
        select: expect.objectContaining({ planSummary: true }),
      }),
    );
    expect(state.session.planSummary).toBe(
      'Review recall first, then reinforce meaning in context.',
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

  it('reveals every fill-blank character once in a shuffled order', async () => {
    itemFindFirst.mockResolvedValue({
      id: 'item',
      reviewQuestion: {
        id: 'question',
        questionType: QuestionType.FILL_BLANK,
        correctAnswerText: 'take into account',
      },
    });

    const hints = await Promise.all(
      Array.from({ length: 15 }, (_, hintIndex) =>
        repository.revealFillBlankHint('owner', 'session', 'item', hintIndex),
      ),
    );
    const answerWords = ['take', 'into', 'account'];
    const positions = hints.map(
      ({ wordIndex, characterIndex }) => `${wordIndex}:${characterIndex}`,
    );

    expect(new Set(positions).size).toBe(15);
    expect(positions).not.toEqual(
      answerWords.flatMap((word, wordIndex) =>
        Array.from(
          word,
          (_, characterIndex) => `${wordIndex}:${characterIndex}`,
        ),
      ),
    );
    for (const hint of hints) {
      expect(hint.revealedCharacter).toBe(
        Array.from(answerWords[hint.wordIndex])[hint.characterIndex],
      );
      expect(hint.totalCharacters).toBe(15);
    }
    expect(itemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewSessionId: 'session',
          status: ReviewSessionItemStatus.PENDING,
          reviewSession: {
            is: {
              userId: 'owner',
              status: ReviewSessionStatus.IN_PROGRESS,
            },
          },
        }),
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('restores persisted feedback only while its owner-scoped item is pending', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
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

  it('loads persisted answer-submission facts without grading or scoring them', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 0,
      sequenceNumber: 1,
      _count: { answers: 0 },
      reviewQuestion: {
        id: 'question',
        articleSentenceTermId: 'term',
        questionType: QuestionType.SELECT_MEANING,
        correctAnswerText: null,
        answerExplanation: null,
        isCaseSensitive: false,
        points: 2,
        options: [],
      },
    });
    vocabularyFindUnique.mockResolvedValue(reviewVocabulary);
    itemFindMany.mockResolvedValue([{ id: 'next-item', sequenceNumber: 2 }]);
    questionFindMany.mockResolvedValueOnce([
      { id: 'cached-retry', questionType: QuestionType.FILL_BLANK },
    ]);

    const context = await repository.getAnswerSubmissionContext(
      'owner',
      'session',
      { reviewSessionItemId: 'item', reviewQuestionId: 'question' },
    );

    expect(context).toMatchObject({
      session: { id: 'session' },
      item: {
        id: 'item',
        retryCount: 0,
        answerCount: 0,
        question: { id: 'question', questionType: QuestionType.SELECT_MEANING },
      },
      vocabulary: { id: 'vocabulary' },
      pendingItemsAfterCurrent: [{ id: 'next-item', sequenceNumber: 2 }],
      retryQuestionCandidates: [
        { id: 'cached-retry', questionType: QuestionType.FILL_BLANK },
      ],
    });
    expect(answerCreate).not.toHaveBeenCalled();
    expect(vocabularyUpdate).not.toHaveBeenCalled();
  });

  it('atomically commits precomputed answer values and revalidates the snapshot', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      status: ReviewSessionStatus.IN_PROGRESS,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 0,
      sequenceNumber: 1,
      _count: { answers: 0 },
      reviewQuestion: { id: 'question' },
    });
    answerCreate.mockResolvedValue({ id: 'answer' });
    vocabularyUpdate.mockResolvedValue({ id: 'vocabulary' });
    itemCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    await repository.commitAnswerSubmission('owner', {
      expected: {
        sessionId: 'session',
        reviewSessionItemId: 'item',
        reviewQuestionId: 'question',
        retryCount: 0,
        answerCount: 0,
        userVocabularyId: 'vocabulary',
      },
      answer: {
        selectedOptionId: 'option',
        userAnswerText: null,
        isCorrect: true,
        responseTimeMs: 1_200,
        hintsUsed: 0,
        inferredReviewScore: 4,
        skillDimension: ReviewSkillDimension.RECOGNITION,
        answeredAt: new Date('2026-08-03T00:01:00Z'),
      },
      item: {
        status: ReviewSessionItemStatus.COMPLETED,
        retryCount: 0,
        finalInferredScore: 4,
        completedAt: new Date('2026-08-03T00:01:00Z'),
      },
      vocabularySchedule: {
        learningStatus: LearningStatus.REVIEWING,
        reviewIntervalDays: 2,
        lastReviewedAt: new Date('2026-08-03T00:01:00Z'),
        nextReviewAt: new Date('2026-08-05T00:01:00Z'),
        consecutiveCorrectReviews: 1,
        lapseCount: 0,
        lastReviewScore: 4,
      },
    });

    expect(answerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attemptNumber: 1, isCorrect: true }),
      }),
    );
    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReviewSessionItemStatus.COMPLETED,
          finalInferredScore: 4,
        }),
      }),
    );
    expect(vocabularyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'vocabulary' } }),
    );
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReviewSessionStatus.COMPLETED,
        }),
      }),
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('maps a concurrent duplicate commit to a submission conflict', async () => {
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
      reviewQuestion: { id: 'question' },
    });
    answerCreate.mockRejectedValue({ code: 'P2002' });

    await expect(
      repository.commitAnswerSubmission('owner', {
        expected: {
          sessionId: 'session',
          reviewSessionItemId: 'item',
          reviewQuestionId: 'question',
          retryCount: 0,
          answerCount: 0,
          userVocabularyId: null,
        },
        answer: {
          selectedOptionId: 'option',
          userAnswerText: null,
          isCorrect: true,
          responseTimeMs: null,
          hintsUsed: 0,
          inferredReviewScore: 4,
          skillDimension: ReviewSkillDimension.RECOGNITION,
          answeredAt: new Date('2026-08-03T00:01:00Z'),
        },
        item: {
          status: ReviewSessionItemStatus.COMPLETED,
          retryCount: 0,
          finalInferredScore: 4,
          completedAt: new Date('2026-08-03T00:01:00Z'),
        },
      }),
    ).rejects.toBeInstanceOf(ReviewSubmissionConflictError);
    expect(itemUpdate).not.toHaveBeenCalled();
    expect(vocabularyUpdate).not.toHaveBeenCalled();
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

  it('skips, reschedules, and completes the session in one transaction', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'session',
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date('2026-08-03T00:00:00Z'),
      completedAt: null,
    });
    itemFindFirst.mockResolvedValue({
      id: 'item',
      userVocabularyId: 'vocabulary',
      retryCount: 0,
      _count: { answers: 0 },
      reviewQuestion: { id: 'question' },
    });
    vocabularyUpdate.mockResolvedValue({ id: 'vocabulary' });
    itemFindMany.mockResolvedValue([
      { reviewQuestion: { points: 1 }, answers: [] },
    ]);

    const result = await repository.skipItem(
      'owner',
      'session',
      {
        reviewSessionItemId: 'item',
        reviewQuestionId: 'question',
      },
      {
        learningStatus: LearningStatus.LEARNING,
        reviewIntervalDays: 1,
        lastReviewedAt: new Date('2026-08-03T00:00:00Z'),
        nextReviewAt: new Date('2026-08-04T00:00:00Z'),
        consecutiveCorrectReviews: 0,
        lapseCount: 1,
        lastReviewScore: 0,
      },
    );

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
