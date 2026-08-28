import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  ArticleStatus,
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
  lemma: string;
  cefrLevel: CefrLevel;
  articleId: string;
  articleTitle: string;
  saveCount: AnalyticsNumericValue;
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
          COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::bigint AS completed_count
        FROM user_article_progress WHERE first_opened_at >= ${from} AND first_opened_at < ${to} GROUP BY article_id
      ), saves AS (
        SELECT s.article_id, COUNT(*)::bigint AS save_count FROM user_vocabularies uv
        JOIN article_sentence_terms ast ON ast.id = uv.article_sentence_term_id
        JOIN article_sentences s ON s.id = ast.sentence_id
        WHERE uv.saved_at >= ${from} AND uv.saved_at < ${to} GROUP BY s.article_id
      )
      SELECT a.id AS "articleId", a.title, a.slug::text, a.status, c.name AS category,
        COALESCE(r.opened_count, 0)::bigint AS "openedCount",
        COALESCE(r.completed_count, 0)::bigint AS "completedCount",
        COALESCE(s.save_count, 0)::bigint AS "savedVocabularyCount"
      FROM articles a JOIN categories c ON c.id = a.category_id
      LEFT JOIN reading r ON r.article_id = a.id LEFT JOIN saves s ON s.article_id = a.id
      WHERE (r.article_id IS NOT NULL OR s.article_id IS NOT NULL)
      ${categoryPredicate}
      ORDER BY "openedCount" DESC, "savedVocabularyCount" DESC, a.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  queryCompletionRates(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND a.category_id = ${categoryId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminArticleCompletionRow[]>(Prisma.sql`
      SELECT a.id AS "articleId", a.title, COUNT(*)::bigint AS opened,
        COUNT(*) FILTER (WHERE uap.completed_at IS NOT NULL)::bigint AS completed
      FROM user_article_progress uap JOIN articles a ON a.id = uap.article_id
      WHERE uap.first_opened_at >= ${from} AND uap.first_opened_at < ${to} ${categoryPredicate}
      GROUP BY a.id, a.title
      ORDER BY COUNT(*) FILTER (WHERE uap.completed_at IS NOT NULL)::numeric / COUNT(*) DESC, COUNT(*) DESC, a.id ASC
      LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
    `);
  }

  queryTermSaveCounts(from: Date, to: Date, categoryId?: string) {
    const categoryPredicate = categoryId
      ? Prisma.sql`AND a.category_id = ${categoryId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<AdminTermSaveRow[]>(Prisma.sql`
      SELECT ast.id AS "articleSentenceTermId", ast.value, ast.lemma,
        ast.cefr_level AS "cefrLevel", a.id AS "articleId", a.title AS "articleTitle", COUNT(*)::bigint AS "saveCount"
      FROM user_vocabularies uv JOIN article_sentence_terms ast ON ast.id = uv.article_sentence_term_id
      JOIN article_sentences s ON s.id = ast.sentence_id JOIN articles a ON a.id = s.article_id
      WHERE uv.saved_at >= ${from} AND uv.saved_at < ${to} ${categoryPredicate}
      GROUP BY ast.id, ast.value, ast.lemma, ast.cefr_level, a.id, a.title
      ORDER BY "saveCount" DESC, ast.lemma ASC, ast.id ASC LIMIT ${ANALYTICS_TOP_CONTENT_LIMIT}
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
        FROM users u ${statusPredicate}
      )
      SELECT COUNT(*) FILTER (WHERE NOT reading AND NOT vocabulary)::bigint AS inactive,
        COUNT(*) FILTER (WHERE reading AND NOT vocabulary)::bigint AS "readingOnly",
        COUNT(*) FILTER (WHERE NOT reading AND vocabulary)::bigint AS "vocabularyOnly",
        COUNT(*) FILTER (WHERE reading AND vocabulary)::bigint AS "multiActivity"
      FROM activity_flags
    `);
  }
}
