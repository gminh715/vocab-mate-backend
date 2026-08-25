import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  LearningStatus,
  ReadingStatus,
  ReviewSessionStatus,
  type QuestionType,
} from '../../../../generated/prisma/enums';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';
import { APP_CONFIG } from '../../../config/config.module';
import { PrismaService } from '../../../database/prisma.service';
import { dueVocabularyWhere } from '../../vocabularies/due-vocabulary.where';
import {
  bucketExpression,
  type AnalyticsNumericValue,
} from '../analytics.helpers';
import { AnalyticsGroupBy } from '../dto/analytics-query.dto';

interface CountTrendRow {
  bucket: string;
  count: AnalyticsNumericValue;
}
interface ReadingCategoryRow {
  categoryId: string;
  categoryName: string;
  opened: AnalyticsNumericValue;
  completed: AnalyticsNumericValue;
}
interface ReadingTrendRow {
  bucket: string;
  opened: AnalyticsNumericValue;
  completed: AnalyticsNumericValue;
}
interface QuizAggregateRow {
  answers: AnalyticsNumericValue;
  correctAnswers: AnalyticsNumericValue;
  averageScore: AnalyticsNumericValue | null;
}
interface QuestionTypeRow {
  questionType: QuestionType;
  answers: AnalyticsNumericValue;
  correctAnswers: AnalyticsNumericValue;
}
interface QuizTrendRow extends QuizAggregateRow {
  bucket: string;
  sessions: AnalyticsNumericValue;
}

@Injectable()
export class LearnerAnalyticsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  getOverview(userId: string, from: Date, to: Date, requestTime: Date) {
    const completedSessionWhere = {
      userId,
      status: ReviewSessionStatus.COMPLETED,
      completedAt: { gte: from, lt: to },
    } as const;
    return Promise.all([
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
          completedAt: { gte: from, lt: to },
        },
      }),
      this.prisma.reviewSession.count({ where: completedSessionWhere }),
      this.prisma.reviewAnswer.groupBy({
        by: ['isCorrect'],
        where: {
          reviewSessionItem: {
            is: { reviewSession: { is: completedSessionWhere } },
          },
        },
        _count: { _all: true },
      }),
    ]);
  }

  getVocabularySnapshot(userId: string, requestTime: Date) {
    return Promise.all([
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
    ]);
  }

  queryVocabularyTrend(
    userId: string,
    from: Date,
    to: Date,
    groupBy: AnalyticsGroupBy,
  ) {
    return this.prisma.$queryRaw<CountTrendRow[]>(Prisma.sql`
      SELECT ${bucketExpression(Prisma.sql`uv.saved_at`, groupBy, this.appConfig.analyticsTimezone)} AS bucket,
        COUNT(*)::bigint AS count
      FROM user_vocabularies uv
      WHERE uv.user_id = ${userId}::uuid
        AND uv.saved_at >= ${from}
        AND uv.saved_at < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  getReadingCounts(userId: string, from: Date, to: Date) {
    const cohortWhere = {
      userId,
      firstOpenedAt: { gte: from, lt: to },
    } as const;
    return Promise.all([
      this.prisma.userArticleProgress.count({ where: cohortWhere }),
      this.prisma.userArticleProgress.count({
        where: {
          ...cohortWhere,
          status: ReadingStatus.COMPLETED,
          completedAt: { not: null },
        },
      }),
    ]);
  }

  queryReadingCategories(userId: string, from: Date, to: Date) {
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

  queryReadingTrend(
    userId: string,
    from: Date,
    to: Date,
    groupBy: AnalyticsGroupBy,
  ) {
    return this.prisma.$queryRaw<ReadingTrendRow[]>(Prisma.sql`
      SELECT ${bucketExpression(Prisma.sql`uap.first_opened_at`, groupBy, this.appConfig.analyticsTimezone)} AS bucket,
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

  getQuizSessionCount(
    userId: string,
    from: Date,
    to: Date,
    articleId?: string,
  ) {
    return this.prisma.reviewSession.count({
      where: {
        userId,
        status: ReviewSessionStatus.COMPLETED,
        completedAt: { gte: from, lt: to },
        ...(articleId ? { articleId } : {}),
      },
    });
  }

  queryQuizAggregate(userId: string, from: Date, to: Date, articleId?: string) {
    return this.prisma.$queryRaw<QuizAggregateRow[]>(Prisma.sql`
      WITH ${this.quizScoresCte(userId, from, to, articleId)}
      SELECT COALESCE(SUM(answers), 0)::bigint AS answers,
        COALESCE(SUM(correct_answers), 0)::bigint AS "correctAnswers",
        AVG(earned_points / NULLIF(total_points, 0))
          FILTER (WHERE total_points > 0) AS "averageScore"
      FROM session_scores
    `);
  }

  queryQuestionTypes(userId: string, from: Date, to: Date, articleId?: string) {
    const articlePredicate = articleId
      ? Prisma.sql`AND rs.article_id = ${articleId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<QuestionTypeRow[]>(Prisma.sql`
      WITH eligible_sessions AS (
        SELECT rs.id FROM review_sessions rs
        WHERE rs.status = ${ReviewSessionStatus.COMPLETED}::review_session_status
          AND rs.completed_at >= ${from} AND rs.completed_at < ${to}
          AND rs.user_id = ${userId}::uuid ${articlePredicate}
      )
      SELECT qq.question_type AS "questionType", COUNT(*)::bigint AS answers,
        COUNT(*) FILTER (WHERE ra.is_correct IS TRUE)::bigint AS "correctAnswers"
      FROM eligible_sessions es
      JOIN review_session_items rsi ON rsi.review_session_id = es.id
      JOIN review_answers ra ON ra.review_session_item_id = rsi.id
      JOIN quiz_questions qq ON qq.id = rsi.quiz_question_id
      GROUP BY qq.question_type
    `);
  }

  queryQuizTrend(
    userId: string,
    from: Date,
    to: Date,
    groupBy: AnalyticsGroupBy,
    articleId?: string,
  ) {
    return this.prisma.$queryRaw<QuizTrendRow[]>(Prisma.sql`
      WITH ${this.quizScoresCte(userId, from, to, articleId)}
      SELECT ${bucketExpression(Prisma.sql`completed_at`, groupBy, this.appConfig.analyticsTimezone)} AS bucket,
        COUNT(*)::bigint AS sessions,
        COALESCE(SUM(answers), 0)::bigint AS answers,
        COALESCE(SUM(correct_answers), 0)::bigint AS "correctAnswers",
        AVG(earned_points / NULLIF(total_points, 0))
          FILTER (WHERE total_points > 0) AS "averageScore"
      FROM session_scores
      GROUP BY 1 ORDER BY 1 ASC
    `);
  }

  private quizScoresCte(
    userId: string,
    from: Date,
    to: Date,
    articleId?: string,
  ) {
    const articlePredicate = articleId
      ? Prisma.sql`AND rs.article_id = ${articleId}::uuid`
      : Prisma.empty;
    return Prisma.sql`
      eligible_sessions AS (
        SELECT rs.id, rs.quiz_id, rs.article_id, rs.completed_at
        FROM review_sessions rs
        WHERE rs.status = ${ReviewSessionStatus.COMPLETED}::review_session_status
          AND rs.completed_at >= ${from} AND rs.completed_at < ${to}
          AND rs.user_id = ${userId}::uuid ${articlePredicate}
      ),
      session_scores AS (
        SELECT es.id, es.quiz_id, es.article_id, es.completed_at,
          COUNT(ra.id)::bigint AS answers,
          COUNT(ra.id) FILTER (WHERE ra.is_correct IS TRUE)::bigint AS correct_answers,
          COALESCE(SUM(qq.points) FILTER (WHERE ra.id IS NOT NULL AND qq.is_active), 0)::numeric AS total_points,
          COALESCE(SUM(qq.points) FILTER (WHERE ra.is_correct IS TRUE AND qq.is_active), 0)::numeric AS earned_points
        FROM eligible_sessions es
        LEFT JOIN review_session_items rsi ON rsi.review_session_id = es.id
        LEFT JOIN review_answers ra ON ra.review_session_item_id = rsi.id
        LEFT JOIN quiz_questions qq ON qq.id = rsi.quiz_question_id
        GROUP BY es.id, es.quiz_id, es.article_id, es.completed_at
      )
    `;
  }
}
