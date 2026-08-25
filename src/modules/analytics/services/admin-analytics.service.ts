import { Inject, Injectable } from '@nestjs/common';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';
import { APP_CONFIG } from '../../../config/config.module';
import {
  fillMissingBuckets,
  roundRatio,
  toSafeCount,
} from '../analytics.helpers';
import {
  type AdminContentAnalyticsQueryDto,
  type AdminUserAnalyticsQueryDto,
  type AnalyticsDateRangeQueryDto,
  resolveAnalyticsDateRange,
  resolveAnalyticsGroupBy,
} from '../dto/analytics-query.dto';
import { AdminAnalyticsRepository } from '../repositories/admin-analytics.repository';

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly repository: AdminAnalyticsRepository,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

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
    ] = await this.repository.getOverview(range.from, range.to);
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
    const [topRows, completionRows, termRows] = await Promise.all([
      this.repository.queryTopArticles(range.from, range.to, query.categoryId),
      this.repository.queryCompletionRates(
        range.from,
        range.to,
        query.categoryId,
      ),
      this.repository.queryTermSaveCounts(
        range.from,
        range.to,
        query.categoryId,
      ),
    ]);
    return {
      topArticles: topRows.map((row) => ({
        ...row,
        openedCount: toSafeCount(row.openedCount),
        completedCount: toSafeCount(row.completedCount),
        savedVocabularyCount: toSafeCount(row.savedVocabularyCount),
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
        this.repository.queryRegistrationTrend(
          range.from,
          range.to,
          groupBy,
          query.status,
        ),
        this.repository.queryActiveUserCount(
          range.from,
          range.to,
          query.status,
        ),
        this.repository.queryRetention(
          range.from,
          midpoint,
          range.to,
          query.status,
        ),
        this.repository.queryLearningDistribution(
          range.from,
          range.to,
          query.status,
        ),
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
      reviewOnly: 0,
      multiActivity: 0,
    };
    return {
      registrationsTrend: fillMissingBuckets(
        registrationRows,
        range.from,
        range.to,
        groupBy,
        this.appConfig.analyticsTimezone,
        ({ bucket, count }) => ({ bucket, registrations: toSafeCount(count) }),
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
        reviewOnly: toSafeCount(distribution.reviewOnly),
        multiActivity: toSafeCount(distribution.multiActivity),
      },
    };
  }
}
