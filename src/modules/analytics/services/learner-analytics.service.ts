import { Inject, Injectable } from '@nestjs/common';
import { CefrLevel } from '../../../../generated/prisma/enums';
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
    const [savedVocabulary, articlesCompleted] =
      await this.repository.getOverview(userId, range.from, range.to);
    return {
      savedVocabulary,
      articlesCompleted,
    };
  }

  async getVocabularyAnalytics(
    userId: string,
    query: VocabularyAnalyticsQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const groupBy = resolveAnalyticsGroupBy(range, query.groupBy);
    const [[totalCount, cefrRows], trendRows] = await Promise.all([
      this.repository.getVocabularySnapshot(userId),
      this.repository.queryVocabularyTrend(
        userId,
        range.from,
        range.to,
        groupBy,
      ),
    ]);
    const cefrCounts = new Map(
      cefrRows.map((row) => [row.savedCefrLevel, row._count._all]),
    );
    return {
      totals: {
        total: totalCount,
      },
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

  async getReviewAnalytics(userId: string, requestTime = new Date()) {
    const [[totalCount, stateRows], completedSessionRows] = await Promise.all([
      this.repository.getFsrsStateCounts(userId),
      this.repository.getCompletedStudyDates(userId),
    ]);

    const stateCounts = new Map(
      stateRows.map((row) => [row.fsrsState, row._count._all]),
    );
    const newCount = stateCounts.get('NEW') ?? 0;
    const learningCount = stateCounts.get('LEARNING') ?? 0;
    const reviewCount = stateCounts.get('REVIEW') ?? 0;
    const relearningCount = stateCounts.get('RELEARNING') ?? 0;

    const completedDatesSet = new Set(
      completedSessionRows.map((row) =>
        row.studyDate instanceof Date
          ? row.studyDate.toISOString().slice(0, 10)
          : String(row.studyDate).slice(0, 10),
      ),
    );

    const todayStr = this.formatDateToStudyDate(
      requestTime,
      this.appConfig.analyticsTimezone,
    );
    const isTodayCompleted = completedDatesSet.has(todayStr);

    let currentStreak = 0;
    if (isTodayCompleted) {
      currentStreak = 1;
      let checkDate = this.getPreviousDateStr(todayStr);
      while (completedDatesSet.has(checkDate)) {
        currentStreak += 1;
        checkDate = this.getPreviousDateStr(checkDate);
      }
    } else {
      const yesterdayStr = this.getPreviousDateStr(todayStr);
      if (completedDatesSet.has(yesterdayStr)) {
        currentStreak = 1;
        let checkDate = this.getPreviousDateStr(yesterdayStr);
        while (completedDatesSet.has(checkDate)) {
          currentStreak += 1;
          checkDate = this.getPreviousDateStr(checkDate);
        }
      }
    }

    const sortedDates = Array.from(completedDatesSet).sort();
    let longestStreak = 0;
    if (sortedDates.length > 0) {
      let maxStreak = 1;
      let cur = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const expectedPrev = this.getPreviousDateStr(sortedDates[i]);
        if (expectedPrev === sortedDates[i - 1]) {
          cur += 1;
          if (cur > maxStreak) {
            maxStreak = cur;
          }
        } else if (sortedDates[i] !== sortedDates[i - 1]) {
          cur = 1;
        }
      }
      longestStreak = Math.max(maxStreak, currentStreak);
    }

    const recentDays = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = this.addDaysToDateStr(todayStr, -i);
      recentDays.push({
        date: dateStr,
        isCompleted: completedDatesSet.has(dateStr),
        isToday: i === 0,
      });
    }

    return {
      streak: {
        currentStreak,
        longestStreak,
        isTodayCompleted,
        recentDays,
        completedDates: Array.from(completedDatesSet),
      },
      mastery: {
        total: totalCount,
        newCount,
        learningCount,
        reviewCount,
        relearningCount,
        masteryRate: roundRatio(reviewCount, totalCount),
      },
    };
  }

  private formatDateToStudyDate(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  private addDaysToDateStr(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private getPreviousDateStr(dateStr: string): string {
    return this.addDaysToDateStr(dateStr, -1);
  }
}
