import { Inject, Injectable } from '@nestjs/common';
import { CefrLevel, LearningStatus } from '../../../../generated/prisma/enums';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';
import { APP_CONFIG } from '../../../config/config.module';
import {
  fillMissingBuckets,
  roundRatio,
  toSafeCount,
} from '../analytics.helpers';
import {
  type AnalyticsDateRangeQueryDto,
  resolveAnalyticsDateRange,
  resolveAnalyticsGroupBy,
  type VocabularyAnalyticsQueryDto,
} from '../dto/analytics-query.dto';
import { LearnerAnalyticsRepository } from '../repositories/learner-analytics.repository';

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
@Injectable()
export class LearnerAnalyticsService {
  constructor(
    private readonly repository: LearnerAnalyticsRepository,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  async getOverview(
    userId: string,
    query: AnalyticsDateRangeQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const [
      savedVocabulary,
      dueToday,
      mastered,
      articlesCompleted,
      sessions,
      answerCounts,
    ] = await this.repository.getOverview(
      userId,
      range.from,
      range.to,
      requestTime,
    );
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
      reviewAccuracy: roundRatio(correctAnswers, totalAnswers),
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
    const [[statusRows, due, cefrRows], trendRows] = await Promise.all([
      this.repository.getVocabularySnapshot(userId, requestTime),
      this.repository.queryVocabularyTrend(
        userId,
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
      savedTrend: fillMissingBuckets(
        trendRows,
        range.from,
        range.to,
        groupBy,
        this.appConfig.analyticsTimezone,
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
    const [[opened, completed], categoryRows, trendRows] = await Promise.all([
      this.repository.getReadingCounts(userId, range.from, range.to),
      this.repository.queryReadingCategories(userId, range.from, range.to),
      this.repository.queryReadingTrend(userId, range.from, range.to, groupBy),
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
      trend: fillMissingBuckets(
        trendRows,
        range.from,
        range.to,
        groupBy,
        this.appConfig.analyticsTimezone,
        (row) => ({
          bucket: row.bucket,
          opened: toSafeCount(row.opened),
          completed: toSafeCount(row.completed),
        }),
        (bucket) => ({ bucket, opened: 0, completed: 0 }),
      ),
    };
  }
}
