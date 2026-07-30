/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import {
  ArticleStatus,
  CefrLevel,
  LearningStatus,
  QuestionType,
  ReadingStatus,
  ReviewSessionStatus,
  UserStatus,
} from '../../../generated/prisma/enums';
import { APP_CONFIG } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsService, toSafeCount } from './analytics.service';
import { AnalyticsGroupBy } from './dto/analytics-query.dto';

describe('AnalyticsService', () => {
  const vocabularyCount = jest.fn();
  const vocabularyGroupBy = jest.fn();
  const progressCount = jest.fn();
  const sessionCount = jest.fn();
  const answerGroupBy = jest.fn();
  const userCount = jest.fn();
  const articleCount = jest.fn();
  const queryRaw = jest.fn();
  let service: AnalyticsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    vocabularyCount.mockResolvedValue(0);
    vocabularyGroupBy.mockResolvedValue([]);
    progressCount.mockResolvedValue(0);
    sessionCount.mockResolvedValue(0);
    answerGroupBy.mockResolvedValue([]);
    userCount.mockResolvedValue(0);
    articleCount.mockResolvedValue(0);
    queryRaw.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: {
            userVocabulary: {
              count: vocabularyCount,
              groupBy: vocabularyGroupBy,
            },
            userArticleProgress: { count: progressCount },
            reviewSession: { count: sessionCount },
            reviewAnswer: { groupBy: answerGroupBy },
            user: { count: userCount },
            article: { count: articleCount },
            $queryRaw: queryRaw,
          },
        },
        {
          provide: APP_CONFIG,
          useValue: { port: 3000, analyticsTimezone: 'UTC' },
        },
      ],
    }).compile();
    service = module.get(AnalyticsService);
  });

  it('returns a complete zero-data overview', async () => {
    await expect(
      service.getOverview('owner-id', {}, new Date('2026-07-24T00:00:00Z')),
    ).resolves.toEqual({
      savedVocabulary: 0,
      dueToday: 0,
      mastered: 0,
      articlesCompleted: 0,
      quizAccuracy: 0,
      sessions: 0,
    });
  });

  it('uses stock counts, the shared due rule, half-open completed filters, and answer-level accuracy', async () => {
    vocabularyCount
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3);
    progressCount.mockResolvedValue(2);
    sessionCount.mockResolvedValue(2);
    answerGroupBy.mockResolvedValue([
      { isCorrect: true, _count: { _all: 4 } },
      { isCorrect: false, _count: { _all: 1 } },
    ]);
    const now = new Date('2026-07-24T12:00:00Z');

    const result = await service.getOverview(
      'owner-id',
      {
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-24T00:00:00Z',
      },
      now,
    );

    expect(result).toEqual({
      savedVocabulary: 12,
      dueToday: 4,
      mastered: 3,
      articlesCompleted: 2,
      quizAccuracy: 0.8,
      sessions: 2,
    });
    expect(vocabularyCount.mock.calls[1][0].where).toEqual({
      userId: 'owner-id',
      learningStatus: {
        in: [
          LearningStatus.NEW,
          LearningStatus.LEARNING,
          LearningStatus.REVIEWING,
        ],
      },
      OR: [
        { nextReviewAt: { lte: now } },
        { learningStatus: LearningStatus.NEW, nextReviewAt: null },
      ],
    });
    expect(progressCount).toHaveBeenCalledWith({
      where: {
        userId: 'owner-id',
        status: ReadingStatus.COMPLETED,
        completedAt: {
          gte: new Date('2026-07-01T00:00:00Z'),
          lt: new Date('2026-07-24T00:00:00Z'),
        },
      },
    });
    expect(sessionCount).toHaveBeenCalledWith({
      where: {
        userId: 'owner-id',
        status: ReviewSessionStatus.COMPLETED,
        completedAt: {
          gte: new Date('2026-07-01T00:00:00Z'),
          lt: new Date('2026-07-24T00:00:00Z'),
        },
      },
    });
    expect(answerGroupBy.mock.calls[0][0].where.reviewSession.is).toEqual(
      sessionCount.mock.calls[0][0].where,
    );
  });

  it('returns all status and saved CEFR snapshot categories in stable order', async () => {
    vocabularyGroupBy
      .mockResolvedValueOnce([
        { learningStatus: LearningStatus.MASTERED, _count: { _all: 2 } },
        { learningStatus: LearningStatus.NEW, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { savedCefrLevel: CefrLevel.C2, _count: { _all: 1 } },
        { savedCefrLevel: CefrLevel.A1, _count: { _all: 2 } },
      ]);
    vocabularyCount.mockResolvedValue(1);

    const result = await service.getVocabularyAnalytics(
      'owner-id',
      {
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-02T00:00:00Z',
      },
      new Date('2026-07-24T00:00:00Z'),
    );

    expect(result.totals).toEqual({ total: 3, due: 1, mastered: 2 });
    expect(result.byStatus).toEqual([
      { status: LearningStatus.NEW, count: 1 },
      { status: LearningStatus.LEARNING, count: 0 },
      { status: LearningStatus.REVIEWING, count: 0 },
      { status: LearningStatus.MASTERED, count: 2 },
      { status: LearningStatus.IGNORED, count: 0 },
    ]);
    expect(result.byCefr).toEqual([
      { cefrLevel: CefrLevel.A1, count: 2 },
      { cefrLevel: CefrLevel.A2, count: 0 },
      { cefrLevel: CefrLevel.B1, count: 0 },
      { cefrLevel: CefrLevel.B2, count: 0 },
      { cefrLevel: CefrLevel.C1, count: 0 },
      { cefrLevel: CefrLevel.C2, count: 1 },
    ]);
    expect(vocabularyGroupBy.mock.calls[1][0]).toMatchObject({
      by: ['savedCefrLevel'],
      where: { userId: 'owner-id' },
    });
  });

  it.each([
    [
      AnalyticsGroupBy.DAY,
      '2026-07-01T00:00:00Z',
      '2026-07-04T00:00:00Z',
      [
        { bucket: '2026-07-01', count: 2 },
        { bucket: '2026-07-02', count: 0 },
        { bucket: '2026-07-03', count: 0 },
      ],
    ],
    [
      AnalyticsGroupBy.WEEK,
      '2026-07-01T00:00:00Z',
      '2026-07-15T00:00:00Z',
      [
        { bucket: '2026-06-29', count: 2 },
        { bucket: '2026-07-06', count: 0 },
        { bucket: '2026-07-13', count: 0 },
      ],
    ],
    [
      AnalyticsGroupBy.MONTH,
      '2026-01-15T00:00:00Z',
      '2026-04-01T00:00:00Z',
      [
        { bucket: '2026-01-01', count: 2 },
        { bucket: '2026-02-01', count: 0 },
        { bucket: '2026-03-01', count: 0 },
      ],
    ],
  ])(
    'fills missing %s buckets in ascending order',
    async (groupBy, from, to, expected) => {
      queryRaw.mockResolvedValue([{ bucket: expected[0].bucket, count: 2n }]);
      const result = await service.getVocabularyAnalytics(
        'owner-id',
        { from, to, groupBy },
        new Date('2026-07-24T00:00:00Z'),
      );

      expect(result.savedTrend).toEqual(expected);
      const sql = queryRaw.mock.calls[0][0] as {
        strings: string[];
        values: unknown[];
      };
      expect(sql.values).toEqual(
        expect.arrayContaining([
          'UTC',
          'owner-id',
          new Date(from),
          new Date(to),
        ]),
      );
      expect(sql.strings.join(' ')).toContain('uv.saved_at <');
    },
  );

  it('scopes every vocabulary aggregate and trend query to the caller', async () => {
    await service.getVocabularyAnalytics(
      'owner-a',
      {
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-02T00:00:00Z',
      },
      new Date('2026-07-24T00:00:00Z'),
    );

    expect(vocabularyGroupBy.mock.calls[0][0].where).toEqual({
      userId: 'owner-a',
    });
    expect(vocabularyGroupBy.mock.calls[1][0].where).toEqual({
      userId: 'owner-a',
    });
    expect(vocabularyCount.mock.calls[0][0].where.userId).toBe('owner-a');
    const sql = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toContain('owner-a');
  });

  it('converts bigint counts safely for JSON', () => {
    expect(toSafeCount(9n)).toBe(9);
    expect(() => toSafeCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      RangeError,
    );
  });

  it('uses an owner-scoped first-opened reading cohort and retains historical category data', async () => {
    progressCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    queryRaw
      .mockResolvedValueOnce([
        {
          categoryId: 'category-id',
          categoryName: 'Inactive history',
          opened: 2n,
          completed: 1n,
        },
      ])
      .mockResolvedValueOnce([
        { bucket: '2026-07-01', opened: 2n, completed: 1n },
      ]);

    const result = await service.getReadingAnalytics('owner-id', {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-03T00:00:00Z',
    });

    expect(result).toEqual({
      opened: 2,
      completed: 1,
      completionRate: 0.5,
      byCategory: [
        {
          categoryId: 'category-id',
          categoryName: 'Inactive history',
          opened: 2,
          completed: 1,
          completionRate: 0.5,
        },
      ],
      trend: [
        { bucket: '2026-07-01', opened: 2, completed: 1 },
        { bucket: '2026-07-02', opened: 0, completed: 0 },
      ],
    });
    expect(progressCount.mock.calls[0][0].where).toMatchObject({
      userId: 'owner-id',
      firstOpenedAt: {
        gte: new Date('2026-07-01T00:00:00Z'),
        lt: new Date('2026-07-03T00:00:00Z'),
      },
    });
    expect(progressCount.mock.calls[1][0].where).toMatchObject({
      userId: 'owner-id',
      status: ReadingStatus.COMPLETED,
      completedAt: { not: null },
    });
    const sql = queryRaw.mock.calls
      .map(([value]) => (value as { strings: string[] }).strings.join(' '))
      .join(' ');
    expect(sql).toContain('uap.user_id =');
    expect(sql).not.toContain('a.status');
    expect(sql).not.toContain('c.is_active');
  });

  it('distinguishes answer accuracy from normalized quiz score and fills all question types', async () => {
    sessionCount.mockResolvedValue(2);
    queryRaw
      .mockResolvedValueOnce([
        { answers: 4n, correctAnswers: 3n, averageScore: '0.625' },
      ])
      .mockResolvedValueOnce([
        {
          questionType: QuestionType.SELECT_MEANING,
          answers: 4n,
          correctAnswers: 3n,
        },
      ])
      .mockResolvedValueOnce([
        {
          bucket: '2026-07-01',
          sessions: 2n,
          answers: 4n,
          correctAnswers: 3n,
          averageScore: '0.625',
        },
      ]);

    const result = await service.getQuizAnalytics('owner-id', {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-02T00:00:00Z',
      articleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    expect(result).toMatchObject({
      sessions: 2,
      accuracy: 0.75,
      averageScore: 0.625,
      trend: [
        {
          bucket: '2026-07-01',
          sessions: 2,
          accuracy: 0.75,
          averageScore: 0.625,
        },
      ],
    });
    expect(result.byQuestionType).toEqual([
      {
        questionType: QuestionType.SELECT_MEANING,
        answers: 4,
        correctAnswers: 3,
        accuracy: 0.75,
      },
      ...[
        QuestionType.SELECT_WORD,
        QuestionType.SELECT_CORRECT_CONTEXT,
        QuestionType.FILL_BLANK,
      ].map((questionType) => ({
        questionType,
        answers: 0,
        correctAnswers: 0,
        accuracy: 0,
      })),
    ]);
    expect(sessionCount.mock.calls[0][0].where).toMatchObject({
      userId: 'owner-id',
      status: ReviewSessionStatus.COMPLETED,
      articleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    for (const [sql] of queryRaw.mock.calls) {
      expect((sql as { values: unknown[] }).values).toContain('owner-id');
    }
  });

  it('returns aggregate-only admin overview metrics with a distinct activity union', async () => {
    userCount.mockResolvedValue(20);
    articleCount.mockResolvedValueOnce(12).mockResolvedValueOnce(5);
    vocabularyCount.mockResolvedValue(8);
    sessionCount.mockResolvedValue(4);
    queryRaw.mockResolvedValue([{ count: 7n }]);

    await expect(
      service.getAdminOverview({
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-02T00:00:00Z',
      }),
    ).resolves.toEqual({
      users: 20,
      activeUsers: 7,
      articles: 12,
      publishedArticles: 5,
      savedVocabulary: 8,
      completedSessions: 4,
    });
    const sql = (
      queryRaw.mock.calls[0][0] as { strings: string[] }
    ).strings.join(' ');
    expect(sql.match(/UNION/g)).toHaveLength(2);
    expect(sql).not.toContain('last_login_at');
    expect(sessionCount.mock.calls[0][0].where.status).toBe(
      ReviewSessionStatus.COMPLETED,
    );
  });

  it('maps bounded admin content rows without join multiplication or PII', async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          articleId: 'article',
          title: 'Archived',
          slug: 'archived',
          status: ArticleStatus.ARCHIVED,
          category: 'History',
          openedCount: 5n,
          completedCount: 3n,
          savedVocabularyCount: 4n,
          completedQuizSessions: 2n,
        },
      ])
      .mockResolvedValueOnce([
        { articleId: 'article', title: 'Archived', opened: 5n, completed: 3n },
      ])
      .mockResolvedValueOnce([
        {
          articleSentenceTermId: 'term',
          value: 'word',
          normalizedLemma: 'word',
          cefrLevel: CefrLevel.B1,
          articleId: 'article',
          articleTitle: 'Archived',
          saveCount: 4n,
        },
      ])
      .mockResolvedValueOnce([
        {
          quizId: 'quiz',
          quizTitle: 'Quiz',
          articleId: 'article',
          articleTitle: 'Archived',
          completedSessions: 2n,
          answers: 4n,
          correctAnswers: 3n,
          averageScore: '0.625',
        },
      ]);

    const result = await service.getAdminContentAnalytics({
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-02T00:00:00Z',
      categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    expect(result.completionRates[0].completionRate).toBe(0.6);
    expect(result.quizPerformance[0]).toMatchObject({
      accuracy: 0.75,
      averageScore: 0.625,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /userId|email|personalNote|userAnswer/i,
    );
    const sqlText = queryRaw.mock.calls
      .map(([sql]) => (sql as { strings: string[] }).strings.join(' '))
      .join(' ');
    expect(sqlText).toContain('LIMIT');
    expect(sqlText).toContain('WITH reading AS');
    expect(sqlText).not.toContain('a.status =');
    for (const [sql] of queryRaw.mock.calls) {
      expect((sql as { values: unknown[] }).values).toContain(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
    }
    expect(
      queryRaw.mock.calls.some(([sql]) =>
        (sql as { values: unknown[] }).values.includes(10),
      ),
    ).toBe(true);
  });

  it('applies user status consistently and returns mutually exclusive activity aggregates', async () => {
    queryRaw
      .mockResolvedValueOnce([{ bucket: '2026-07-01', count: 2n }])
      .mockResolvedValueOnce([{ count: 3n }])
      .mockResolvedValueOnce([
        {
          firstWindowActive: 2n,
          secondWindowActive: 2n,
          retainedUsers: 1n,
        },
      ])
      .mockResolvedValueOnce([
        {
          inactive: 1n,
          readingOnly: 1n,
          vocabularyOnly: 1n,
          quizOnly: 1n,
          multiActivity: 2n,
        },
      ]);

    const result = await service.getAdminUserAnalytics({
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-03T00:00:00Z',
      status: UserStatus.ACTIVE,
    });

    expect(result).toEqual({
      registrationsTrend: [
        { bucket: '2026-07-01', registrations: 2 },
        { bucket: '2026-07-02', registrations: 0 },
      ],
      activeLearners: 3,
      retentionProxy: {
        firstWindowActive: 2,
        secondWindowActive: 2,
        retainedUsers: 1,
        rate: 0.5,
      },
      learningDistribution: {
        inactive: 1,
        readingOnly: 1,
        vocabularyOnly: 1,
        quizOnly: 1,
        multiActivity: 2,
      },
    });
    for (const [sql] of queryRaw.mock.calls) {
      expect((sql as { values: unknown[] }).values).toContain(
        UserStatus.ACTIVE,
      );
    }
    expect(
      queryRaw.mock.calls.some(([sql]) =>
        (sql as { values: unknown[] }).values.some(
          (value) =>
            value instanceof Date &&
            value.toISOString() === '2026-07-02T00:00:00.000Z',
        ),
      ),
    ).toBe(true);
  });

  it('returns valid zero-data shapes for every admin endpoint', async () => {
    await expect(service.getAdminOverview({})).resolves.toEqual({
      users: 0,
      activeUsers: 0,
      articles: 0,
      publishedArticles: 0,
      savedVocabulary: 0,
      completedSessions: 0,
    });
    await expect(service.getAdminContentAnalytics({})).resolves.toEqual({
      topArticles: [],
      completionRates: [],
      termSaveCounts: [],
      quizPerformance: [],
    });
    await expect(
      service.getAdminUserAnalytics(
        {
          from: '2026-07-01T00:00:00Z',
          to: '2026-07-02T00:00:00Z',
        },
        new Date('2026-07-02T00:00:00Z'),
      ),
    ).resolves.toEqual({
      registrationsTrend: [{ bucket: '2026-07-01', registrations: 0 }],
      activeLearners: 0,
      retentionProxy: {
        firstWindowActive: 0,
        secondWindowActive: 0,
        retainedUsers: 0,
        rate: 0,
      },
      learningDistribution: {
        inactive: 0,
        readingOnly: 0,
        vocabularyOnly: 0,
        quizOnly: 0,
        multiActivity: 0,
      },
    });
  });
});
