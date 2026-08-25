import { Inject, Injectable } from '@nestjs/common';
import {
  ReviewDecisionSource,
  ReviewSessionStatus,
} from '../../../../generated/prisma/enums';
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
} from '../dto/analytics-query.dto';
import { ReviewAnalyticsRepository } from '../repositories/review-analytics.repository';

const REVIEW_TARGET_DURATIONS = [5, 10, 15] as const;
const REVIEW_DECISION_SOURCES = [
  ReviewDecisionSource.AI,
  ReviewDecisionSource.RULE,
] as const;

@Injectable()
export class ReviewAnalyticsService {
  constructor(
    private readonly repository: ReviewAnalyticsRepository,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  async getReviewAnalytics(
    userId: string,
    query: AnalyticsDateRangeQueryDto,
    requestTime = new Date(),
  ) {
    const range = resolveAnalyticsDateRange(query, requestTime);
    const groupBy = resolveAnalyticsGroupBy(range);
    const [sessionRows, skillRows, decisionRows, retentionRows, trendRows] =
      await Promise.all([
        this.repository.querySessionEvaluation(userId, range.from, range.to),
        this.repository.querySkillEvaluation(userId, range.from, range.to),
        this.repository.queryDecisionEvaluation(userId, range.from, range.to),
        this.repository.queryRetentionEvaluation(userId, range.from, range.to),
        this.repository.queryTrend(userId, range.from, range.to, groupBy),
      ]);
    const sessionsStarted = sessionRows.reduce(
      (sum, row) => sum + toSafeCount(row.count),
      0,
    );
    const sessionsCompleted = sessionRows
      .filter(({ status }) => status === ReviewSessionStatus.COMPLETED)
      .reduce((sum, row) => sum + toSafeCount(row.count), 0);
    const sessionsAbandoned = sessionRows
      .filter(({ status }) => status === ReviewSessionStatus.ABANDONED)
      .reduce((sum, row) => sum + toSafeCount(row.count), 0);
    const answerTotals = skillRows.reduce(
      (totals, row) => ({
        attempts: totals.attempts + toSafeCount(row.attempts),
        correct: totals.correct + toSafeCount(row.correct),
        timedAttempts: totals.timedAttempts + toSafeCount(row.timedAttempts),
        responseTimeTotalMs:
          totals.responseTimeTotalMs + toSafeCount(row.responseTimeTotalMs),
        hintsUsed: totals.hintsUsed + toSafeCount(row.hintsUsed),
        retestAttempts: totals.retestAttempts + toSafeCount(row.retestAttempts),
        correctRetests: totals.correctRetests + toSafeCount(row.correctRetests),
      }),
      {
        attempts: 0,
        correct: 0,
        timedAttempts: 0,
        responseTimeTotalMs: 0,
        hintsUsed: 0,
        retestAttempts: 0,
        correctRetests: 0,
      },
    );
    const durationCounts = new Map(
      REVIEW_TARGET_DURATIONS.map((duration) => [
        duration,
        { started: 0, completed: 0 },
      ]),
    );
    for (const row of sessionRows) {
      if (
        row.targetDurationMinutes === null ||
        !REVIEW_TARGET_DURATIONS.includes(
          row.targetDurationMinutes as (typeof REVIEW_TARGET_DURATIONS)[number],
        )
      )
        continue;
      const duration =
        row.targetDurationMinutes as (typeof REVIEW_TARGET_DURATIONS)[number];
      const counts = durationCounts.get(duration);
      if (!counts) continue;
      const count = toSafeCount(row.count);
      counts.started += count;
      if (row.status === ReviewSessionStatus.COMPLETED)
        counts.completed += count;
    }
    const sourceCounts = new Map(decisionRows.map((row) => [row.source, row]));
    const retentionCounts = new Map(
      retentionRows.map((row) => [row.horizon, row]),
    );
    const retentionWindow = (horizon: 'NEXT_DAY' | 'SEVEN_DAY') => {
      const row = retentionCounts.get(horizon);
      const followUps = row ? toSafeCount(row.followUps) : 0;
      const correct = row ? toSafeCount(row.correct) : 0;
      return { followUps, correct, accuracy: roundRatio(correct, followUps) };
    };
    return {
      sessionsStarted,
      sessionsCompleted,
      sessionsAbandoned,
      completionRate: roundRatio(sessionsCompleted, sessionsStarted),
      answers: answerTotals.attempts,
      correctAnswers: answerTotals.correct,
      accuracy: roundRatio(answerTotals.correct, answerTotals.attempts),
      averageResponseTimeMs:
        answerTotals.timedAttempts === 0
          ? null
          : Math.round(
              answerTotals.responseTimeTotalMs / answerTotals.timedAttempts,
            ),
      hintsUsed: answerTotals.hintsUsed,
      sameSessionRetest: {
        attempts: answerTotals.retestAttempts,
        correct: answerTotals.correctRetests,
        successRate: roundRatio(
          answerTotals.correctRetests,
          answerTotals.retestAttempts,
        ),
      },
      bySkill: skillRows.flatMap((row) => {
        if (row.skillDimension === null) return [];
        const attempts = toSafeCount(row.attempts);
        const correct = toSafeCount(row.correct);
        const timedAttempts = toSafeCount(row.timedAttempts);
        return [
          {
            skillDimension: row.skillDimension,
            attempts,
            correct,
            accuracy: roundRatio(correct, attempts),
            averageResponseTimeMs:
              timedAttempts === 0
                ? null
                : Math.round(
                    toSafeCount(row.responseTimeTotalMs) / timedAttempts,
                  ),
            hintsUsed: toSafeCount(row.hintsUsed),
          },
        ];
      }),
      byDuration: REVIEW_TARGET_DURATIONS.map((targetDurationMinutes) => {
        const counts = durationCounts.get(targetDurationMinutes) ?? {
          started: 0,
          completed: 0,
        };
        return {
          targetDurationMinutes,
          ...counts,
          completionRate: roundRatio(counts.completed, counts.started),
        };
      }),
      byDecisionSource: REVIEW_DECISION_SOURCES.map((source) => {
        const row = sourceCounts.get(source);
        const interventions = row ? toSafeCount(row.interventions) : 0;
        const retestAttempts = row ? toSafeCount(row.retestAttempts) : 0;
        const successfulRetests = row ? toSafeCount(row.successfulRetests) : 0;
        return {
          source,
          interventions,
          retestAttempts,
          successfulRetests,
          retestSuccessRate: roundRatio(successfulRetests, retestAttempts),
        };
      }),
      retention: {
        nextDay: retentionWindow('NEXT_DAY'),
        sevenDay: retentionWindow('SEVEN_DAY'),
      },
      trend: fillMissingBuckets(
        trendRows,
        range.from,
        range.to,
        groupBy,
        this.appConfig.analyticsTimezone,
        (row) => {
          const answers = toSafeCount(row.answers);
          const correctAnswers = toSafeCount(row.correctAnswers);
          const timedAnswers = toSafeCount(row.timedAnswers);
          return {
            bucket: row.bucket,
            answers,
            correctAnswers,
            accuracy: roundRatio(correctAnswers, answers),
            averageResponseTimeMs:
              timedAnswers === 0
                ? null
                : Math.round(
                    toSafeCount(row.responseTimeTotalMs) / timedAnswers,
                  ),
            hintsUsed: toSafeCount(row.hintsUsed),
          };
        },
        (bucket) => ({
          bucket,
          answers: 0,
          correctAnswers: 0,
          accuracy: 0,
          averageResponseTimeMs: null,
          hintsUsed: 0,
        }),
      ),
    };
  }
}
