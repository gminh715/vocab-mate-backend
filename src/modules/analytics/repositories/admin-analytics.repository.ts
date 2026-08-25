import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  ArticleStatus,
  ReadingStatus,
  ReviewSessionStatus,
  type CefrLevel,
  type UserStatus,
} from '../../../../generated/prisma/enums';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';
import { APP_CONFIG } from '../../../config/config.module';
import { PrismaService } from '../../../database/prisma.service';
import {
  bucketExpression,
  type AnalyticsNumericValue,
} from '../analytics.helpers';
import { AnalyticsGroupBy } from '../dto/analytics-query.dto';

export const ANALYTICS_TOP_CONTENT_LIMIT = 10;

interface SingleCountRow {
  count: AnalyticsNumericValue;
}
interface CountTrendRow {
  bucket: string;
  count: AnalyticsNumericValue;
}
interface AdminTopArticleRow {
  articleId: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  category: string;
  openedCount: AnalyticsNumericValue;
  completedCount: AnalyticsNumericValue;
  savedVocabularyCount: AnalyticsNumericValue;
  completedQuizSessions: AnalyticsNumericValue;
}
interface AdminArticleCompletionRow {
  articleId: string;
  title: string;
  opened: AnalyticsNumericValue;
  completed: AnalyticsNumericValue;
}
interface AdminTermSaveRow {
  articleSentenceTermId: string;
  value: string;
  normalizedLemma: string;
  cefrLevel: CefrLevel;
  articleId: string;
  articleTitle: string;
  saveCount: AnalyticsNumericValue;
}
interface AdminQuizPerformanceRow {
  quizId: string;
  quizTitle: string;
  articleId: string;
  articleTitle: string;
  completedSessions: AnalyticsNumericValue;
  answers: AnalyticsNumericValue;
  correctAnswers: AnalyticsNumericValue;
  averageScore: AnalyticsNumericValue | null;
}
interface RetentionRow {
  firstWindowActive: AnalyticsNumericValue;
  secondWindowActive: AnalyticsNumericValue;
  retainedUsers: AnalyticsNumericValue;
}
interface DistributionRow {
  inactive: AnalyticsNumericValue;
  readingOnly: AnalyticsNumericValue;
  vocabularyOnly: AnalyticsNumericValue;
  quizOnly: AnalyticsNumericValue;
  multiActivity: AnalyticsNumericValue;
}

@Injectable()
export class AdminAnalyticsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  getOverview(from: Date, to: Date) {
    return Promise.all([
      this.prisma.user.count(),
      this.queryActiveUserCount(from, to),
      this.prisma.article.count(),
      this.prisma.article.count({ where: { status: ArticleStatus.PUBLISHED } }),
      this.prisma.userVocabulary.count({
        where: { savedAt: { gte: from, lt: to } },
      }),
      this.prisma.reviewSession.count({
        where: {
          status: ReviewSessionStatus.COMPLETED,
          completedAt: { gte: from, lt: to },
        },
      }),
    ]);
  }

  queryActiveUserCount(from: Date, to: Date, status?: UserStatus) {
    const statusPredicate = status
      ? Prisma.sql`WHERE u.status = ${status}::user_status`
      : Prisma.empty;
    return this.prisma.$queryRaw<SingleCountRow[]>(Prisma.sql`
      WITH active_user_ids AS (
        SELECT user_id FROM user_article_progress WHERE last_read_at >= ${from} AND last_read_at < ${to}
        UNION SELECT user_id FROM user_vocabularies WHERE saved_at >= ${from} AND saved_at < ${to}
        UNION SELECT user_id FROM review_sessions WHERE started_at >= ${from} AND started_at < ${to}
      )
      SELECT COUNT(*)::bigint AS count FROM active_user_ids activity
      JOIN users u ON u.id = activity.user_id ${statusPredicate}
    `);
  }

  queryTopArticles(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND a.category_id = ${categoryId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminTopArticleRow[]>(Prisma.sql`
      WITH reading AS (
        SELECT article_id, COUNT(*)::bigint AS opened_count,
          COUNT(*) FILTER (WHERE status = ${ReadingStatus.COMPLETED}::reading_status AND completed_at IS NOT NULL)::bigint AS completed_count
        FROM user_article_progress WHERE first_opened_at >= ${from} AND first_opened_at < ${to} GROUP BY article_id
      ), saves AS (
        SELECT s.article_id, COUNT(*)::bigint AS save_count FROM user_vocabularies uv
        JOIN article_sentence_terms ast ON ast.id = uv.article_sentence_term_id
        JOIN article_sentences s ON s.id = ast.sentence_id
        WHERE uv.saved_at >= ${from} AND uv.saved_at < ${to} GROUP BY s.article_id
      ), sessions AS (
        SELECT article_id, COUNT(*)::bigint AS session_count FROM review_sessions
        WHERE status = ${ReviewSessionStatus.COMPLETED}::review_session_status
          AND completed_at >= ${from} AND completed_at < ${to} AND article_id IS NOT NULL GROUP BY article_id
      )
      SELECT a.id AS "articleId", a.title, a.slug::text, a.status, c.name AS category,
        COALESCE(r.opened_count, 0)::bigint AS "openedCount",
        COALESCE(r.completed_count, 0)::bigint AS "completedCount",
        COALESCE(s.save_count, 0)::bigint AS "savedVocabularyCount",
        COALESCE(q.session_count, 0)::bigint AS "completedQuizSessions"
      FROM articles a JOIN categories c ON c.id = a.category_id
      LEFT JOIN reading r ON r.article_id = a.id LEFT JOIN saves s ON s.article_id = a.id
      LEFT JOIN sessions q ON q.article_id = a.id
      WHERE (r.article_id IS NOT NULL OR s.article_id IS NOT NULL OR q.article_id IS NOT NULL)
      ${categoryPredicate}
      ORDER BY "openedCount" DESC, "savedVocabularyCount" DESC, "completedQuizSessions" DESC, a.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  queryCompletionRates(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND a.category_id = ${categoryId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminArticleCompletionRow[]>(Prisma.sql`
      SELECT a.id AS "articleId", a.title, COUNT(*)::bigint AS opened,
        COUNT(*) FILTER (WHERE uap.status = ${ReadingStatus.COMPLETED}::reading_status AND uap.completed_at IS NOT NULL)::bigint AS completed
      FROM user_article_progress uap JOIN articles a ON a.id = uap.article_id
      WHERE uap.first_opened_at >= ${from} AND uap.first_opened_at < ${to} ${categoryPredicate}
      GROUP BY a.id, a.title
      ORDER BY COUNT(*) FILTER (WHERE uap.status = ${ReadingStatus.COMPLETED}::reading_status AND uap.completed_at IS NOT NULL)::numeric / COUNT(*) DESC, COUNT(*) DESC, a.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  queryTermSaveCounts(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND a.category_id = ${categoryId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminTermSaveRow[]>(Prisma.sql`
      SELECT ast.id AS "articleSentenceTermId", ast.value, ast.normalized_lemma::text AS "normalizedLemma",
        ast.cefr_level AS "cefrLevel", a.id AS "articleId", a.title AS "articleTitle", COUNT(*)::bigint AS "saveCount"
      FROM user_vocabularies uv JOIN article_sentence_terms ast ON ast.id = uv.article_sentence_term_id
      JOIN article_sentences s ON s.id = ast.sentence_id JOIN articles a ON a.id = s.article_id
      WHERE uv.saved_at >= ${from} AND uv.saved_at < ${to} ${categoryPredicate}
      GROUP BY ast.id, ast.value, ast.normalized_lemma, ast.cefr_level, a.id, a.title
      ORDER BY "saveCount" DESC, ast.normalized_lemma ASC, ast.id ASC LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  queryQuizPerformance(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM articles filter_article WHERE filter_article.id = rs.article_id AND filter_article.category_id = ${categoryId}::uuid)`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminQuizPerformanceRow[]>(Prisma.sql`
      WITH ${this.quizScoresCte(from, to, categoryPredicate)}
      SELECT q.id AS "quizId", q.title AS "quizTitle", a.id AS "articleId", a.title AS "articleTitle",
        COUNT(*)::bigint AS "completedSessions", COALESCE(SUM(ss.answers), 0)::bigint AS answers,
        COALESCE(SUM(ss.correct_answers), 0)::bigint AS "correctAnswers",
        AVG(ss.earned_points / NULLIF(ss.total_points, 0)) FILTER (WHERE ss.total_points > 0) AS "averageScore"
      FROM session_scores ss JOIN quizzes q ON q.id = ss.quiz_id JOIN articles a ON a.id = ss.article_id
      GROUP BY q.id, q.title, a.id, a.title
      ORDER BY "completedSessions" DESC, COALESCE(SUM(ss.correct_answers), 0)::numeric / NULLIF(COALESCE(SUM(ss.answers), 0), 0) DESC NULLS LAST, q.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  queryRegistrationTrend(
    from: Date,
    to: Date,
    groupBy: AnalyticsGroupBy,
    status?: UserStatus,
  ) {
    const statusPredicate = status
      ? Prisma.sql`AND u.status = ${status}::user_status`
      : Prisma.empty;
    return this.prisma.$queryRaw<CountTrendRow[]>(Prisma.sql`
      SELECT ${bucketExpression(Prisma.sql`u.created_at`, groupBy, this.appConfig.analyticsTimezone)} AS bucket,
        COUNT(*)::bigint AS count FROM users u
      WHERE u.created_at >= ${from} AND u.created_at < ${to} ${statusPredicate}
      GROUP BY 1 ORDER BY 1 ASC
    `);
  }

  queryRetention(from: Date, midpoint: Date, to: Date, status?: UserStatus) {
    const statusPredicate = status
      ? Prisma.sql`WHERE u.status = ${status}::user_status`
      : Prisma.empty;
    return this.prisma.$queryRaw<RetentionRow[]>(Prisma.sql`
      WITH activity_events AS (
        SELECT user_id, last_read_at AS activity_at FROM user_article_progress WHERE last_read_at >= ${from} AND last_read_at < ${to}
        UNION ALL SELECT user_id, saved_at FROM user_vocabularies WHERE saved_at >= ${from} AND saved_at < ${to}
        UNION ALL SELECT user_id, started_at FROM review_sessions WHERE started_at >= ${from} AND started_at < ${to}
      ), flags AS (
        SELECT ae.user_id, BOOL_OR(ae.activity_at < ${midpoint}) AS first_active, BOOL_OR(ae.activity_at >= ${midpoint}) AS second_active
        FROM activity_events ae GROUP BY ae.user_id
      ), filtered AS (SELECT flags.* FROM flags JOIN users u ON u.id = flags.user_id ${statusPredicate})
      SELECT COUNT(*) FILTER (WHERE first_active)::bigint AS "firstWindowActive",
        COUNT(*) FILTER (WHERE second_active)::bigint AS "secondWindowActive",
        COUNT(*) FILTER (WHERE first_active AND second_active)::bigint AS "retainedUsers" FROM filtered
    `);
  }

  queryLearningDistribution(from: Date, to: Date, status?: UserStatus) {
    const statusPredicate = status
      ? Prisma.sql`WHERE u.status = ${status}::user_status`
      : Prisma.empty;
    return this.prisma.$queryRaw<DistributionRow[]>(Prisma.sql`
      WITH activity_flags AS (
        SELECT u.id,
          EXISTS (SELECT 1 FROM user_article_progress p WHERE p.user_id = u.id AND p.last_read_at >= ${from} AND p.last_read_at < ${to}) AS reading,
          EXISTS (SELECT 1 FROM user_vocabularies v WHERE v.user_id = u.id AND v.saved_at >= ${from} AND v.saved_at < ${to}) AS vocabulary,
          EXISTS (SELECT 1 FROM review_sessions r WHERE r.user_id = u.id AND r.started_at >= ${from} AND r.started_at < ${to}) AS quiz
        FROM users u ${statusPredicate}
      )
      SELECT COUNT(*) FILTER (WHERE NOT reading AND NOT vocabulary AND NOT quiz)::bigint AS inactive,
        COUNT(*) FILTER (WHERE reading AND NOT vocabulary AND NOT quiz)::bigint AS "readingOnly",
        COUNT(*) FILTER (WHERE NOT reading AND vocabulary AND NOT quiz)::bigint AS "vocabularyOnly",
        COUNT(*) FILTER (WHERE NOT reading AND NOT vocabulary AND quiz)::bigint AS "quizOnly",
        COUNT(*) FILTER (WHERE reading::int + vocabulary::int + quiz::int >= 2)::bigint AS "multiActivity"
      FROM activity_flags
    `);
  }

  private quizScoresCte(from: Date, to: Date, predicate: Prisma.Sql) {
    return Prisma.sql`
      eligible_sessions AS (
        SELECT rs.id, rs.quiz_id, rs.article_id, rs.completed_at FROM review_sessions rs
        WHERE rs.status = ${ReviewSessionStatus.COMPLETED}::review_session_status
          AND rs.completed_at >= ${from} AND rs.completed_at < ${to} ${predicate}
      ), session_scores AS (
        SELECT es.id, es.quiz_id, es.article_id, es.completed_at, COUNT(ra.id)::bigint AS answers,
          COUNT(ra.id) FILTER (WHERE ra.is_correct IS TRUE)::bigint AS correct_answers,
          COALESCE(SUM(qq.points) FILTER (WHERE ra.id IS NOT NULL AND qq.is_active), 0)::numeric AS total_points,
          COALESCE(SUM(qq.points) FILTER (WHERE ra.is_correct IS TRUE AND qq.is_active), 0)::numeric AS earned_points
        FROM eligible_sessions es LEFT JOIN review_session_items rsi ON rsi.review_session_id = es.id
        LEFT JOIN review_answers ra ON ra.review_session_item_id = rsi.id
        LEFT JOIN quiz_questions qq ON qq.id = rsi.quiz_question_id
        GROUP BY es.id, es.quiz_id, es.article_id, es.completed_at
      )
    `;
  }
}
