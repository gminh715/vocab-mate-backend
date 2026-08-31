import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';
import { APP_CONFIG } from '../../../config/config.module';
import { PrismaService } from '../../../database/prisma.service';
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
@Injectable()
export class LearnerAnalyticsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  getOverview(userId: string, from: Date, to: Date) {
    return Promise.all([
      this.prisma.userVocabulary.count({ where: { userId } }),
      this.prisma.userArticleProgress.count({
        where: {
          userId,
          completedAt: { not: null, gte: from, lt: to },
        },
      }),
    ]);
  }

  getVocabularySnapshot(userId: string) {
    return Promise.all([
      this.prisma.userVocabulary.count({ where: { userId } }),
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
          completedAt: { not: null },
        },
      }),
    ]);
  }

  queryReadingCategories(userId: string, from: Date, to: Date) {
    return this.prisma.$queryRaw<ReadingCategoryRow[]>(Prisma.sql`
      SELECT c.id AS "categoryId", c.name AS "categoryName",
        COUNT(*)::bigint AS opened,
        COUNT(*) FILTER (WHERE uap.completed_at IS NOT NULL)::bigint AS completed
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
        COUNT(*) FILTER (WHERE uap.completed_at IS NOT NULL)::bigint AS completed
      FROM user_article_progress uap
      WHERE uap.user_id = ${userId}::uuid
        AND uap.first_opened_at >= ${from}
        AND uap.first_opened_at < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  getFsrsStateCounts(userId: string) {
    return Promise.all([
      this.prisma.userVocabulary.count({ where: { userId } }),
      this.prisma.userVocabulary.groupBy({
        by: ['fsrsState'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);
  }

  getCompletedStudyDates(userId: string) {
    return this.prisma.tutorSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
      },
      select: {
        studyDate: true,
      },
      orderBy: {
        studyDate: 'desc',
      },
    });
  }
}
