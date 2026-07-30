import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  ArticleStatus,
  CefrLevel,
  LearningStatus,
  QuestionType,
  ReadingStatus,
  ReviewSessionStatus,
  type UserStatus,
} from '../../../generated/prisma/enums';
import type { ReturnTypeOfAppConfig } from '../../config/app.config';
import { APP_CONFIG } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { dueVocabularyWhere } from '../vocabularies/vocabularies.repository';
import {
  type AdminContentAnalyticsQueryDto,
  type AdminUserAnalyticsQueryDto,
  AnalyticsDateRangeQueryDto,
  AnalyticsGroupBy,
  type QuizAnalyticsQueryDto,
  resolveAnalyticsDateRange,
  resolveAnalyticsGroupBy,
  type VocabularyAnalyticsQueryDto,
} from './dto/analytics-query.dto';

const DAY_MS = 86_400_000;
export const ANALYTICS_TOP_CONTENT_LIMIT = 10;
const LEARNING_STATUSES = [
  LearningStatus.NEW,
  LearningStatus.LEARNING,
  LearningStatus.REVIEWING,
  LearningStatus.MASTERED,
  LearningStatus.IGNORED,
] as const;
const CEFR_LEVELS = [
  CefrLevel.A1,
  CefrLevel.A2,
  CefrLevel.B1,
  CefrLevel.B2,
  CefrLevel.C1,
  CefrLevel.C2,
] as const;
const QUESTION_TYPES = [
  QuestionType.SELECT_MEANING,
  QuestionType.SELECT_WORD,
  QuestionType.SELECT_CORRECT_CONTEXT,
  QuestionType.FILL_BLANK,
] as const;

type NumericValue = Prisma.Decimal | bigint | number | string;
interface CountTrendRow {
  bucket: string;
  count: NumericValue;
}
interface ReadingCategoryRow {
  categoryId: string;
  categoryName: string;
  opened: NumericValue;
  completed: NumericValue;
}
interface ReadingTrendRow {
  bucket: string;
  opened: NumericValue;
  completed: NumericValue;
}
interface QuizAggregateRow {
  answers: NumericValue;
  correctAnswers: NumericValue;
  averageScore: NumericValue | null;
}
interface QuestionTypeRow {
  questionType: QuestionType;
  answers: NumericValue;
  correctAnswers: NumericValue;
}
interface QuizTrendRow extends QuizAggregateRow {
  bucket: string;
  sessions: NumericValue;
}
interface SingleCountRow {
  count: NumericValue;
}
interface AdminTopArticleRow {
  articleId: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  category: string;
  openedCount: NumericValue;
  completedCount: NumericValue;
  savedVocabularyCount: NumericValue;
  completedQuizSessions: NumericValue;
}
interface AdminArticleCompletionRow {
  articleId: string;
  title: string;
  opened: NumericValue;
  completed: NumericValue;
}
interface AdminTermSaveRow {
  articleSentenceTermId: string;
  value: string;
  normalizedLemma: string;
  cefrLevel: CefrLevel;
  articleId: string;
  articleTitle: string;
  saveCount: NumericValue;
}
interface AdminQuizPerformanceRow {
  quizId: string;
  quizTitle: string;
  articleId: string;
  articleTitle: string;
  completedSessions: NumericValue;
  answers: NumericValue;
  correctAnswers: NumericValue;
  averageScore: NumericValue | null;
}
interface RetentionRow {
  firstWindowActive: NumericValue;
  secondWindowActive: NumericValue;
  retainedUsers: NumericValue;
}
interface DistributionRow {
  inactive: NumericValue;
  readingOnly: NumericValue;
  vocabularyOnly: NumericValue;
  quizOnly: NumericValue;
  multiActivity: NumericValue;
}

export const toSafeCount = (value: NumericValue): number => {
  const normalized =
    value instanceof Prisma.Decimal ? value.toFixed(0) : value.toString();
  const count = BigInt(normalized);
  if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Analytics count is outside the safe integer range');
  }
  return Number(count);
};

export const roundRatio = (numerator: number, denominator: number): number =>
  denominator === 0
    ? 0
    : Math.round((numerator / denominator) * 10_000) / 10_000;

export const toRatio = (value: NumericValue | null): number => {
  if (value === null) return 0;
  const numberValue =
    value instanceof Prisma.Decimal ? value.toNumber() : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new RangeError('Analytics ratio is not finite');
  }
  return Math.min(1, Math.max(0, Math.round(numberValue * 10_000) / 10_000));
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  async getOverview(
    userId: string,
    query: AnalyticsDateRangeQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const completedSessionWhere = {
      userId,
      status: ReviewSessionStatus.COMPLETED,
      completedAt: { gte: range.from, lt: range.to },
    } as const;
    const [
      savedVocabulary,
      dueToday,
      mastered,
      articlesCompleted,
      sessions,
      answerCounts,
    ] = await Promise.all([
      this.prisma.userVocabulary.count({ where: { userId } }),
      this.prisma.userVocabulary.count({
        where: { userId, ...dueVocabularyWhere(requestTime) },
      }),
      this.prisma.userVocabulary.count({
        where: { userId, learningStatus: LearningStatus.MASTERED },
      }),
      this.prisma.userArticleProgress.count({
        where: {
          userId,
          status: ReadingStatus.COMPLETED,
          completedAt: { gte: range.from, lt: range.to },
        },
      }),
      this.prisma.reviewSession.count({ where: completedSessionWhere }),
      this.prisma.reviewAnswer.groupBy({
        by: ['isCorrect'],
        where: { reviewSession: { is: completedSessionWhere } },
        _count: { _all: true },
      }),
    ]);
    const totalAnswers = answerCounts.reduce(
      (total, row) => total + row._count._all,
      0,
    );
    const correctAnswers =
      answerCounts.find((row) => row.isCorrect === true)?._count._all ?? 0;
    return {
      savedVocabulary,
      dueToday,
      mastered,
      articlesCompleted,
      quizAccuracy: roundRatio(correctAnswers, totalAnswers),
      sessions,
    };
  }

  async getVocabularyAnalytics(
    userId: string,
    query: VocabularyAnalyticsQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const groupBy = resolveAnalyticsGroupBy(range, query.groupBy);
    const [statusRows, due, cefrRows, trendRows] = await Promise.all([
      this.prisma.userVocabulary.groupBy({
        by: ['learningStatus'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.userVocabulary.count({
        where: { userId, ...dueVocabularyWhere(requestTime) },
      }),
      this.prisma.userVocabulary.groupBy({
        by: ['savedCefrLevel'],
        where: { userId },
        _count: { _all: true },
      }),
      this.queryCountTrend(
        'user_vocabularies',
        'saved_at',
        Prisma.sql`user_id = ${userId}::uuid`,
        range.from,
        range.to,
        groupBy,
      ),
    ]);
    const statusCounts = new Map(
      statusRows.map((row) => [row.learningStatus, row._count._all]),
    );
    const cefrCounts = new Map(
      cefrRows.map((row) => [row.savedCefrLevel, row._count._all]),
    );
    return {
      totals: {
        total: statusRows.reduce((sum, row) => sum + row._count._all, 0),
        due,
        mastered: statusCounts.get(LearningStatus.MASTERED) ?? 0,
      },
      byStatus: LEARNING_STATUSES.map((status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
      })),
      byCefr: CEFR_LEVELS.map((cefrLevel) => ({
        cefrLevel,
        count: cefrCounts.get(cefrLevel) ?? 0,
      })),
      savedTrend: this.fillMissingBuckets(
        trendRows,
        range.from,
        range.to,
        groupBy,
        ({ bucket, count }) => ({ bucket, count: toSafeCount(count) }),
        (bucket) => ({ bucket, count: 0 }),
      ),
    };
  }

  async getReadingAnalytics(
    userId: string,
    query: AnalyticsDateRangeQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const groupBy = resolveAnalyticsGroupBy(range);
    const cohortWhere = {
      userId,
      firstOpenedAt: { gte: range.from, lt: range.to },
    } as const;
    const [opened, completed, categoryRows, trendRows] = await Promise.all([
      this.prisma.userArticleProgress.count({ where: cohortWhere }),
      this.prisma.userArticleProgress.count({
        where: {
          ...cohortWhere,
          status: ReadingStatus.COMPLETED,
          completedAt: { not: null },
        },
      }),
      this.queryReadingCategories(userId, range.from, range.to),
      this.queryReadingTrend(userId, range.from, range.to, groupBy),
    ]);
    return {
      opened,
      completed,
      completionRate: roundRatio(completed, opened),
      byCategory: categoryRows.map((row) => {
        const categoryOpened = toSafeCount(row.opened);
        const categoryCompleted = toSafeCount(row.completed);
        return {
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          opened: categoryOpened,
          completed: categoryCompleted,
          completionRate: roundRatio(categoryCompleted, categoryOpened),
        };
      }),
      trend: this.fillMissingBuckets(
        trendRows,
        range.from,
        range.to,
        groupBy,
        (row) => ({
          bucket: row.bucket,
          opened: toSafeCount(row.opened),
          completed: toSafeCount(row.completed),
        }),
        (bucket) => ({ bucket, opened: 0, completed: 0 }),
      ),
    };
  }

  async getQuizAnalytics(
    userId: string,
    query: QuizAnalyticsQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const groupBy = resolveAnalyticsGroupBy(range);
    const articlePredicate = query.articleId
      ? Prisma.sql`AND rs.article_id = ${query.articleId}::uuid`
      : Prisma.empty;
    const predicate = Prisma.sql`
      AND rs.user_id = ${userId}::uuid
      ${articlePredicate}
    `;
    const [sessions, aggregateRows, typeRows, trendRows] = await Promise.all([
      this.prisma.reviewSession.count({
        where: {
          userId,
          status: ReviewSessionStatus.COMPLETED,
          completedAt: { gte: range.from, lt: range.to },
          ...(query.articleId ? { articleId: query.articleId } : {}),
        },
      }),
      this.queryQuizAggregate(range.from, range.to, predicate),
      this.queryQuestionTypes(range.from, range.to, predicate),
      this.queryQuizTrend(range.from, range.to, predicate, groupBy),
    ]);
    const aggregate = aggregateRows[0] ?? {
      answers: 0,
      correctAnswers: 0,
      averageScore: null,
    };
    const answers = toSafeCount(aggregate.answers);
    const correctAnswers = toSafeCount(aggregate.correctAnswers);
    const typeCounts = new Map(typeRows.map((row) => [row.questionType, row]));
    return {
      sessions,
      accuracy: roundRatio(correctAnswers, answers),
      averageScore: toRatio(aggregate.averageScore),
      byQuestionType: QUESTION_TYPES.map((questionType) => {
        const row = typeCounts.get(questionType);
        const typeAnswers = row ? toSafeCount(row.answers) : 0;
        const typeCorrect = row ? toSafeCount(row.correctAnswers) : 0;
        return {
          questionType,
          answers: typeAnswers,
          correctAnswers: typeCorrect,
          accuracy: roundRatio(typeCorrect, typeAnswers),
        };
      }),
      trend: this.fillMissingBuckets(
        trendRows,
        range.from,
        range.to,
        groupBy,
        (row) => ({
          bucket: row.bucket,
          sessions: toSafeCount(row.sessions),
          accuracy: roundRatio(
            toSafeCount(row.correctAnswers),
            toSafeCount(row.answers),
          ),
          averageScore: toRatio(row.averageScore),
        }),
        (bucket) => ({
          bucket,
          sessions: 0,
          accuracy: 0,
          averageScore: 0,
        }),
      ),
    };
  }

  async getAdminOverview(
    query: AnalyticsDateRangeQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const [
      users,
      activeRows,
      articles,
      publishedArticles,
      savedVocabulary,
      completedSessions,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.queryActiveUserCount(range.from, range.to),
      this.prisma.article.count(),
      this.prisma.article.count({
        where: { status: ArticleStatus.PUBLISHED },
      }),
      this.prisma.userVocabulary.count({
        where: { savedAt: { gte: range.from, lt: range.to } },
      }),
      this.prisma.reviewSession.count({
        where: {
          status: ReviewSessionStatus.COMPLETED,
          completedAt: { gte: range.from, lt: range.to },
        },
      }),
    ]);
    return {
      users,
      activeUsers: toSafeCount(activeRows[0]?.count ?? 0),
      articles,
      publishedArticles,
      savedVocabulary,
      completedSessions,
    };
  }

  async getAdminContentAnalytics(
    query: AdminContentAnalyticsQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const [topRows, completionRows, termRows, quizRows] = await Promise.all([
      this.queryTopArticles(range.from, range.to, query.categoryId),
      this.queryAdminCompletionRates(range.from, range.to, query.categoryId),
      this.queryTermSaveCounts(range.from, range.to, query.categoryId),
      this.queryAdminQuizPerformance(range.from, range.to, query.categoryId),
    ]);
    return {
      topArticles: topRows.map((row) => ({
        ...row,
        openedCount: toSafeCount(row.openedCount),
        completedCount: toSafeCount(row.completedCount),
        savedVocabularyCount: toSafeCount(row.savedVocabularyCount),
        completedQuizSessions: toSafeCount(row.completedQuizSessions),
      })),
      completionRates: completionRows.map((row) => {
        const opened = toSafeCount(row.opened);
        const completed = toSafeCount(row.completed);
        return {
          articleId: row.articleId,
          title: row.title,
          opened,
          completed,
          completionRate: roundRatio(completed, opened),
        };
      }),
      termSaveCounts: termRows.map((row) => ({
        ...row,
        saveCount: toSafeCount(row.saveCount),
      })),
      quizPerformance: quizRows.map((row) => {
        const answers = toSafeCount(row.answers);
        const correctAnswers = toSafeCount(row.correctAnswers);
        return {
          quizId: row.quizId,
          quizTitle: row.quizTitle,
          articleId: row.articleId,
          articleTitle: row.articleTitle,
          completedSessions: toSafeCount(row.completedSessions),
          accuracy: roundRatio(correctAnswers, answers),
          averageScore: toRatio(row.averageScore),
        };
      }),
    };
  }

  async getAdminUserAnalytics(
    query: AdminUserAnalyticsQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const groupBy = resolveAnalyticsGroupBy(range);
    const midpoint = new Date(
      range.from.getTime() + (range.to.getTime() - range.from.getTime()) / 2,
    );
    const [registrationRows, activeRows, retentionRows, distributionRows] =
      await Promise.all([
        this.queryRegistrationTrend(
          range.from,
          range.to,
          groupBy,
          query.status,
        ),
        this.queryActiveUserCount(range.from, range.to, query.status),
        this.queryRetention(range.from, midpoint, range.to, query.status),
        this.queryLearningDistribution(range.from, range.to, query.status),
      ]);
    const retention = retentionRows[0] ?? {
      firstWindowActive: 0,
      secondWindowActive: 0,
      retainedUsers: 0,
    };
    const firstWindowActive = toSafeCount(retention.firstWindowActive);
    const secondWindowActive = toSafeCount(retention.secondWindowActive);
    const retainedUsers = toSafeCount(retention.retainedUsers);
    const distribution = distributionRows[0] ?? {
      inactive: 0,
      readingOnly: 0,
      vocabularyOnly: 0,
      quizOnly: 0,
      multiActivity: 0,
    };
    return {
      registrationsTrend: this.fillMissingBuckets(
        registrationRows,
        range.from,
        range.to,
        groupBy,
        ({ bucket, count }) => ({
          bucket,
          registrations: toSafeCount(count),
        }),
        (bucket) => ({ bucket, registrations: 0 }),
      ),
      activeLearners: toSafeCount(activeRows[0]?.count ?? 0),
      retentionProxy: {
        firstWindowActive,
        secondWindowActive,
        retainedUsers,
        rate: roundRatio(retainedUsers, firstWindowActive),
      },
      learningDistribution: {
        inactive: toSafeCount(distribution.inactive),
        readingOnly: toSafeCount(distribution.readingOnly),
        vocabularyOnly: toSafeCount(distribution.vocabularyOnly),
        quizOnly: toSafeCount(distribution.quizOnly),
        multiActivity: toSafeCount(distribution.multiActivity),
      },
    };
  }

  private queryReadingCategories(userId: string, from: Date, to: Date) {
    return this.prisma.$queryRaw<ReadingCategoryRow[]>(Prisma.sql`
      SELECT c.id AS "categoryId", c.name AS "categoryName",
        COUNT(*)::bigint AS opened,
        COUNT(*) FILTER (
          WHERE uap.status = ${ReadingStatus.COMPLETED}::reading_status
            AND uap.completed_at IS NOT NULL
        )::bigint AS completed
      FROM user_article_progress uap
      JOIN articles a ON a.id = uap.article_id
      JOIN categories c ON c.id = a.category_id
      WHERE uap.user_id = ${userId}::uuid
        AND uap.first_opened_at >= ${from}
        AND uap.first_opened_at < ${to}
      GROUP BY c.id, c.name
      ORDER BY opened DESC, c.name ASC, c.id ASC
    `);
  }

  private queryReadingTrend(
    userId: string,
    from: Date,
    to: Date,
    groupBy: AnalyticsGroupBy,
  ) {
    return this.prisma.$queryRaw<ReadingTrendRow[]>(Prisma.sql`
      SELECT ${this.bucketExpression(Prisma.sql`uap.first_opened_at`, groupBy)}
        AS bucket,
        COUNT(*)::bigint AS opened,
        COUNT(*) FILTER (
          WHERE uap.status = ${ReadingStatus.COMPLETED}::reading_status
            AND uap.completed_at IS NOT NULL
        )::bigint AS completed
      FROM user_article_progress uap
      WHERE uap.user_id = ${userId}::uuid
        AND uap.first_opened_at >= ${from}
        AND uap.first_opened_at < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private quizScoresCte(from: Date, to: Date, predicate: Prisma.Sql) {
    return Prisma.sql`
      eligible_sessions AS (
        SELECT rs.id, rs.quiz_id, rs.article_id, rs.completed_at
        FROM review_sessions rs
        WHERE rs.status = ${ReviewSessionStatus.COMPLETED}::review_session_status
          AND rs.completed_at >= ${from}
          AND rs.completed_at < ${to}
          ${predicate}
      ),
      session_scores AS (
        SELECT es.id, es.quiz_id, es.article_id, es.completed_at,
          COUNT(ra.id)::bigint AS answers,
          COUNT(ra.id) FILTER (WHERE ra.is_correct IS TRUE)::bigint
            AS correct_answers,
          COALESCE(SUM(qq.points) FILTER (
            WHERE ra.id IS NOT NULL AND qq.is_active
          ), 0)::numeric AS total_points,
          COALESCE(SUM(qq.points) FILTER (
            WHERE ra.is_correct IS TRUE AND qq.is_active
          ), 0)::numeric AS earned_points
        FROM eligible_sessions es
        LEFT JOIN review_answers ra ON ra.review_session_id = es.id
        LEFT JOIN quiz_questions qq ON qq.id = ra.quiz_question_id
        GROUP BY es.id, es.quiz_id, es.article_id, es.completed_at
      )
    `;
  }

  private queryQuizAggregate(from: Date, to: Date, predicate: Prisma.Sql) {
    return this.prisma.$queryRaw<QuizAggregateRow[]>(Prisma.sql`
      WITH ${this.quizScoresCte(from, to, predicate)}
      SELECT
        COALESCE(SUM(answers), 0)::bigint AS answers,
        COALESCE(SUM(correct_answers), 0)::bigint AS "correctAnswers",
        AVG(earned_points / NULLIF(total_points, 0))
          FILTER (WHERE total_points > 0) AS "averageScore"
      FROM session_scores
    `);
  }

  private queryQuestionTypes(from: Date, to: Date, predicate: Prisma.Sql) {
    return this.prisma.$queryRaw<QuestionTypeRow[]>(Prisma.sql`
      WITH eligible_sessions AS (
        SELECT rs.id
        FROM review_sessions rs
        WHERE rs.status = ${ReviewSessionStatus.COMPLETED}::review_session_status
          AND rs.completed_at >= ${from}
          AND rs.completed_at < ${to}
          ${predicate}
      )
      SELECT qq.question_type AS "questionType",
        COUNT(*)::bigint AS answers,
        COUNT(*) FILTER (WHERE ra.is_correct IS TRUE)::bigint
          AS "correctAnswers"
      FROM eligible_sessions es
      JOIN review_answers ra ON ra.review_session_id = es.id
      JOIN quiz_questions qq ON qq.id = ra.quiz_question_id
      GROUP BY qq.question_type
    `);
  }

  private queryQuizTrend(
    from: Date,
    to: Date,
    predicate: Prisma.Sql,
    groupBy: AnalyticsGroupBy,
  ) {
    return this.prisma.$queryRaw<QuizTrendRow[]>(Prisma.sql`
      WITH ${this.quizScoresCte(from, to, predicate)}
      SELECT ${this.bucketExpression(Prisma.sql`completed_at`, groupBy)}
          AS bucket,
        COUNT(*)::bigint AS sessions,
        COALESCE(SUM(answers), 0)::bigint AS answers,
        COALESCE(SUM(correct_answers), 0)::bigint AS "correctAnswers",
        AVG(earned_points / NULLIF(total_points, 0))
          FILTER (WHERE total_points > 0) AS "averageScore"
      FROM session_scores
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private queryActiveUserCount(from: Date, to: Date, status?: UserStatus) {
    const statusPredicate = status
      ? Prisma.sql`WHERE u.status = ${status}::user_status`
      : Prisma.empty;
    return this.prisma.$queryRaw<SingleCountRow[]>(Prisma.sql`
      WITH active_user_ids AS (
        SELECT user_id FROM user_article_progress
        WHERE last_read_at >= ${from} AND last_read_at < ${to}
        UNION
        SELECT user_id FROM user_vocabularies
        WHERE saved_at >= ${from} AND saved_at < ${to}
        UNION
        SELECT user_id FROM review_sessions
        WHERE started_at >= ${from} AND started_at < ${to}
      )
      SELECT COUNT(*)::bigint AS count
      FROM active_user_ids activity
      JOIN users u ON u.id = activity.user_id
      ${statusPredicate}
    `);
  }

  private queryTopArticles(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND a.category_id = ${categoryId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminTopArticleRow[]>(Prisma.sql`
      WITH reading AS (
        SELECT article_id,
          COUNT(*)::bigint AS opened_count,
          COUNT(*) FILTER (
            WHERE status = ${ReadingStatus.COMPLETED}::reading_status
              AND completed_at IS NOT NULL
          )::bigint AS completed_count
        FROM user_article_progress
        WHERE first_opened_at >= ${from} AND first_opened_at < ${to}
        GROUP BY article_id
      ),
      saves AS (
        SELECT s.article_id, COUNT(*)::bigint AS save_count
        FROM user_vocabularies uv
        JOIN article_sentence_terms ast ON ast.id = uv.article_sentence_term_id
        JOIN article_sentences s ON s.id = ast.sentence_id
        WHERE uv.saved_at >= ${from} AND uv.saved_at < ${to}
        GROUP BY s.article_id
      ),
      sessions AS (
        SELECT article_id, COUNT(*)::bigint AS session_count
        FROM review_sessions
        WHERE status = ${ReviewSessionStatus.COMPLETED}::review_session_status
          AND completed_at >= ${from} AND completed_at < ${to}
          AND article_id IS NOT NULL
        GROUP BY article_id
      )
      SELECT a.id AS "articleId", a.title, a.slug::text, a.status,
        c.name AS category,
        COALESCE(r.opened_count, 0)::bigint AS "openedCount",
        COALESCE(r.completed_count, 0)::bigint AS "completedCount",
        COALESCE(s.save_count, 0)::bigint AS "savedVocabularyCount",
        COALESCE(q.session_count, 0)::bigint AS "completedQuizSessions"
      FROM articles a
      JOIN categories c ON c.id = a.category_id
      LEFT JOIN reading r ON r.article_id = a.id
      LEFT JOIN saves s ON s.article_id = a.id
      LEFT JOIN sessions q ON q.article_id = a.id
      WHERE (
        r.article_id IS NOT NULL OR s.article_id IS NOT NULL
        OR q.article_id IS NOT NULL
      )
      ${categoryPredicate}
      ORDER BY "openedCount" DESC, "savedVocabularyCount" DESC,
        "completedQuizSessions" DESC, a.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  private queryAdminCompletionRates(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND a.category_id = ${categoryId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminArticleCompletionRow[]>(Prisma.sql`
      SELECT a.id AS "articleId", a.title, COUNT(*)::bigint AS opened,
        COUNT(*) FILTER (
          WHERE uap.status = ${ReadingStatus.COMPLETED}::reading_status
            AND uap.completed_at IS NOT NULL
        )::bigint AS completed
      FROM user_article_progress uap
      JOIN articles a ON a.id = uap.article_id
      WHERE uap.first_opened_at >= ${from}
        AND uap.first_opened_at < ${to}
        ${categoryPredicate}
      GROUP BY a.id, a.title
      ORDER BY
        COUNT(*) FILTER (
          WHERE uap.status = ${ReadingStatus.COMPLETED}::reading_status
            AND uap.completed_at IS NOT NULL
        )::numeric / COUNT(*) DESC,
        COUNT(*) DESC,
        a.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  private queryTermSaveCounts(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND a.category_id = ${categoryId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminTermSaveRow[]>(Prisma.sql`
      SELECT ast.id AS "articleSentenceTermId", ast.value,
        ast.normalized_lemma::text AS "normalizedLemma",
        ast.cefr_level AS "cefrLevel", a.id AS "articleId",
        a.title AS "articleTitle", COUNT(*)::bigint AS "saveCount"
      FROM user_vocabularies uv
      JOIN article_sentence_terms ast ON ast.id = uv.article_sentence_term_id
      JOIN article_sentences s ON s.id = ast.sentence_id
      JOIN articles a ON a.id = s.article_id
      WHERE uv.saved_at >= ${from} AND uv.saved_at < ${to}
        ${categoryPredicate}
      GROUP BY ast.id, ast.value, ast.normalized_lemma, ast.cefr_level,
        a.id, a.title
      ORDER BY "saveCount" DESC, ast.normalized_lemma ASC, ast.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  private queryAdminQuizPerformance(from: Date, to: Date, categoryId?: string) {
    const predicate = categoryId
      ? Prisma.sql`
          AND EXISTS (
            SELECT 1 FROM articles filter_article
            WHERE filter_article.id = rs.article_id
              AND filter_article.category_id = ${categoryId}::uuid
          )
        `
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminQuizPerformanceRow[]>(Prisma.sql`
      WITH ${this.quizScoresCte(from, to, predicate)}
      SELECT q.id AS "quizId", q.title AS "quizTitle",
        a.id AS "articleId", a.title AS "articleTitle",
        COUNT(*)::bigint AS "completedSessions",
        COALESCE(SUM(ss.answers), 0)::bigint AS answers,
        COALESCE(SUM(ss.correct_answers), 0)::bigint AS "correctAnswers",
        AVG(ss.earned_points / NULLIF(ss.total_points, 0))
          FILTER (WHERE ss.total_points > 0) AS "averageScore"
      FROM session_scores ss
      JOIN quizzes q ON q.id = ss.quiz_id
      JOIN articles a ON a.id = ss.article_id
      GROUP BY q.id, q.title, a.id, a.title
      ORDER BY "completedSessions" DESC,
        COALESCE(SUM(ss.correct_answers), 0)::numeric
          / NULLIF(COALESCE(SUM(ss.answers), 0), 0) DESC NULLS LAST,
        q.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  private queryRegistrationTrend(
    from: Date,
    to: Date,
    groupBy: AnalyticsGroupBy,
    status?: UserStatus,
  ) {
    const statusPredicate = status
      ? Prisma.sql`AND u.status = ${status}::user_status`
      : Prisma.empty;
    return this.prisma.$queryRaw<CountTrendRow[]>(Prisma.sql`
      SELECT ${this.bucketExpression(Prisma.sql`u.created_at`, groupBy)}
          AS bucket,
        COUNT(*)::bigint AS count
      FROM users u
      WHERE u.created_at >= ${from} AND u.created_at < ${to}
        ${statusPredicate}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private queryRetention(
    from: Date,
    midpoint: Date,
    to: Date,
    status?: UserStatus,
  ) {
    const statusPredicate = status
      ? Prisma.sql`WHERE u.status = ${status}::user_status`
      : Prisma.empty;
    return this.prisma.$queryRaw<RetentionRow[]>(Prisma.sql`
      WITH activity_events AS (
        SELECT user_id, last_read_at AS activity_at FROM user_article_progress
        WHERE last_read_at >= ${from} AND last_read_at < ${to}
        UNION ALL
        SELECT user_id, saved_at FROM user_vocabularies
        WHERE saved_at >= ${from} AND saved_at < ${to}
        UNION ALL
        SELECT user_id, started_at FROM review_sessions
        WHERE started_at >= ${from} AND started_at < ${to}
      ),
      flags AS (
        SELECT ae.user_id,
          BOOL_OR(ae.activity_at < ${midpoint}) AS first_active,
          BOOL_OR(ae.activity_at >= ${midpoint}) AS second_active
        FROM activity_events ae
        GROUP BY ae.user_id
      ),
      filtered AS (
        SELECT flags.*
        FROM flags JOIN users u ON u.id = flags.user_id
        ${statusPredicate}
      )
      SELECT COUNT(*) FILTER (WHERE first_active)::bigint
          AS "firstWindowActive",
        COUNT(*) FILTER (WHERE second_active)::bigint
          AS "secondWindowActive",
        COUNT(*) FILTER (WHERE first_active AND second_active)::bigint
          AS "retainedUsers"
      FROM filtered
    `);
  }

  private queryLearningDistribution(from: Date, to: Date, status?: UserStatus) {
    const statusPredicate = status
      ? Prisma.sql`WHERE u.status = ${status}::user_status`
      : Prisma.empty;
    return this.prisma.$queryRaw<DistributionRow[]>(Prisma.sql`
      WITH activity_flags AS (
        SELECT u.id,
          EXISTS (
            SELECT 1 FROM user_article_progress p
            WHERE p.user_id = u.id
              AND p.last_read_at >= ${from} AND p.last_read_at < ${to}
          ) AS reading,
          EXISTS (
            SELECT 1 FROM user_vocabularies v
            WHERE v.user_id = u.id
              AND v.saved_at >= ${from} AND v.saved_at < ${to}
          ) AS vocabulary,
          EXISTS (
            SELECT 1 FROM review_sessions r
            WHERE r.user_id = u.id
              AND r.started_at >= ${from} AND r.started_at < ${to}
          ) AS quiz
        FROM users u
        ${statusPredicate}
      )
      SELECT COUNT(*) FILTER (
          WHERE NOT reading AND NOT vocabulary AND NOT quiz
        )::bigint AS inactive,
        COUNT(*) FILTER (
          WHERE reading AND NOT vocabulary AND NOT quiz
        )::bigint AS "readingOnly",
        COUNT(*) FILTER (
          WHERE NOT reading AND vocabulary AND NOT quiz
        )::bigint AS "vocabularyOnly",
        COUNT(*) FILTER (
          WHERE NOT reading AND NOT vocabulary AND quiz
        )::bigint AS "quizOnly",
        COUNT(*) FILTER (
          WHERE reading::int + vocabulary::int + quiz::int >= 2
        )::bigint AS "multiActivity"
      FROM activity_flags
    `);
  }

  private queryCountTrend(
    table: 'user_vocabularies',
    timestamp: 'saved_at',
    predicate: Prisma.Sql,
    from: Date,
    to: Date,
    groupBy: AnalyticsGroupBy,
  ) {
    const tableSql = { user_vocabularies: Prisma.sql`user_vocabularies uv` }[
      table
    ];
    const timestampSql = { saved_at: Prisma.sql`uv.saved_at` }[timestamp];
    return this.prisma.$queryRaw<CountTrendRow[]>(Prisma.sql`
      SELECT ${this.bucketExpression(timestampSql, groupBy)} AS bucket,
        COUNT(*)::bigint AS count
      FROM ${tableSql}
      WHERE ${predicate}
        AND ${timestampSql} >= ${from}
        AND ${timestampSql} < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private bucketExpression(timestamp: Prisma.Sql, groupBy: AnalyticsGroupBy) {
    const unit = {
      [AnalyticsGroupBy.DAY]: Prisma.sql`'day'`,
      [AnalyticsGroupBy.WEEK]: Prisma.sql`'week'`,
      [AnalyticsGroupBy.MONTH]: Prisma.sql`'month'`,
    }[groupBy];
    return Prisma.sql`
      to_char(
        date_trunc(
          ${unit},
          ${timestamp} AT TIME ZONE ${this.appConfig.analyticsTimezone}
        ),
        'YYYY-MM-DD'
      )
    `;
  }

  private fillMissingBuckets<Row extends { bucket: string }, Result>(
    rows: Row[],
    from: Date,
    to: Date,
    groupBy: AnalyticsGroupBy,
    map: (row: Row) => Result,
    empty: (bucket: string) => Result,
  ): Result[] {
    const byBucket = new Map(rows.map((row) => [row.bucket, row]));
    const start = this.normalizeBucketDate(
      this.localCalendarDate(from),
      groupBy,
    );
    const end = this.normalizeBucketDate(
      this.localCalendarDate(new Date(to.getTime() - 1)),
      groupBy,
    );
    const buckets: Result[] = [];
    for (
      let current = start;
      current.getTime() <= end.getTime();
      current = this.incrementBucket(current, groupBy)
    ) {
      const bucket = current.toISOString().slice(0, 10);
      const row = byBucket.get(bucket);
      buckets.push(row ? map(row) : empty(bucket));
    }
    return buckets;
  }

  private localCalendarDate(instant: Date): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.appConfig.analyticsTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value);
    return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
  }

  private normalizeBucketDate(date: Date, groupBy: AnalyticsGroupBy): Date {
    if (groupBy === AnalyticsGroupBy.MONTH) {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    }
    if (groupBy === AnalyticsGroupBy.WEEK) {
      const day = date.getUTCDay();
      const daysFromMonday = day === 0 ? 6 : day - 1;
      return new Date(date.getTime() - daysFromMonday * DAY_MS);
    }
    return date;
  }

  private incrementBucket(date: Date, groupBy: AnalyticsGroupBy): Date {
    const next = new Date(date);
    if (groupBy === AnalyticsGroupBy.MONTH) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
      next.setUTCDate(
        next.getUTCDate() + (groupBy === AnalyticsGroupBy.WEEK ? 7 : 1),
      );
    }
    return next;
  }
}
