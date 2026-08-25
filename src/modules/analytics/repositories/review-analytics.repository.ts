import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  type ReviewDecisionSource,
  type ReviewSessionStatus,
  type ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';
import { APP_CONFIG } from '../../../config/config.module';
import { PrismaService } from '../../../database/prisma.service';
import {
  bucketExpression,
  type AnalyticsNumericValue,
} from '../analytics.helpers';
import { AnalyticsGroupBy } from '../dto/analytics-query.dto';

interface ReviewSessionEvaluationRow {
  targetDurationMinutes: number | null;
  status: ReviewSessionStatus;
  count: AnalyticsNumericValue;
}
interface ReviewSkillEvaluationRow {
  skillDimension: ReviewSkillDimension | null;
  attempts: AnalyticsNumericValue;
  correct: AnalyticsNumericValue;
  timedAttempts: AnalyticsNumericValue;
  responseTimeTotalMs: AnalyticsNumericValue;
  hintsUsed: AnalyticsNumericValue;
  retestAttempts: AnalyticsNumericValue;
  correctRetests: AnalyticsNumericValue;
}
interface ReviewDecisionEvaluationRow {
  source: ReviewDecisionSource;
  interventions: AnalyticsNumericValue;
  retestAttempts: AnalyticsNumericValue;
  successfulRetests: AnalyticsNumericValue;
}
interface ReviewRetentionEvaluationRow {
  horizon: 'NEXT_DAY' | 'SEVEN_DAY';
  followUps: AnalyticsNumericValue;
  correct: AnalyticsNumericValue;
}
interface ReviewTrendEvaluationRow {
  bucket: string;
  answers: AnalyticsNumericValue;
  correctAnswers: AnalyticsNumericValue;
  timedAnswers: AnalyticsNumericValue;
  responseTimeTotalMs: AnalyticsNumericValue;
  hintsUsed: AnalyticsNumericValue;
}

@Injectable()
export class ReviewAnalyticsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  querySessionEvaluation(userId: string, from: Date, to: Date) {
    return this.prisma.$queryRaw<ReviewSessionEvaluationRow[]>(Prisma.sql`
      SELECT rs.target_duration_minutes AS "targetDurationMinutes", rs.status,
        COUNT(*)::bigint AS count
      FROM review_sessions rs
      WHERE rs.user_id = ${userId}::uuid
        AND rs.started_at >= ${from} AND rs.started_at < ${to}
      GROUP BY rs.target_duration_minutes, rs.status
      ORDER BY rs.target_duration_minutes NULLS LAST, rs.status
    `);
  }

  querySkillEvaluation(userId: string, from: Date, to: Date) {
    return this.prisma.$queryRaw<ReviewSkillEvaluationRow[]>(Prisma.sql`
      SELECT ra.skill_dimension AS "skillDimension", COUNT(*)::bigint AS attempts,
        COUNT(*) FILTER (WHERE ra.is_correct = TRUE)::bigint AS correct,
        COUNT(ra.response_time_ms)::bigint AS "timedAttempts",
        COALESCE(SUM(ra.response_time_ms), 0)::bigint AS "responseTimeTotalMs",
        COALESCE(SUM(ra.hints_used), 0)::bigint AS "hintsUsed",
        COUNT(*) FILTER (WHERE ra.attempt_number > 1)::bigint AS "retestAttempts",
        COUNT(*) FILTER (WHERE ra.attempt_number > 1 AND ra.is_correct = TRUE)::bigint AS "correctRetests"
      FROM review_answers ra
      INNER JOIN review_session_items rsi ON rsi.id = ra.review_session_item_id
      INNER JOIN review_sessions rs ON rs.id = rsi.review_session_id
      WHERE rs.user_id = ${userId}::uuid
        AND ra.answered_at >= ${from} AND ra.answered_at < ${to}
      GROUP BY ra.skill_dimension ORDER BY ra.skill_dimension NULLS LAST
    `);
  }

  queryDecisionEvaluation(userId: string, from: Date, to: Date) {
    return this.prisma.$queryRaw<ReviewDecisionEvaluationRow[]>(Prisma.sql`
      SELECT rad.source, COUNT(*)::bigint AS interventions,
        COUNT(retest.is_correct)::bigint AS "retestAttempts",
        COUNT(*) FILTER (WHERE retest.is_correct = TRUE)::bigint AS "successfulRetests"
      FROM review_agent_decisions rad
      INNER JOIN review_sessions rs ON rs.id = rad.review_session_id
      INNER JOIN review_answers original_answer ON original_answer.id = rad.review_answer_id
      LEFT JOIN LATERAL (
        SELECT candidate.is_correct FROM review_answers candidate
        WHERE candidate.review_session_item_id = original_answer.review_session_item_id
          AND candidate.attempt_number > original_answer.attempt_number
        ORDER BY candidate.attempt_number, candidate.answered_at, candidate.id
        LIMIT 1
      ) retest ON TRUE
      WHERE rs.user_id = ${userId}::uuid
        AND rad.kind = 'ANSWER_INTERVENTION'::review_decision_kind
        AND rad.created_at >= ${from} AND rad.created_at < ${to}
      GROUP BY rad.source ORDER BY rad.source
    `);
  }

  queryRetentionEvaluation(userId: string, from: Date, to: Date) {
    return this.prisma.$queryRaw<ReviewRetentionEvaluationRow[]>(Prisma.sql`
      WITH interventions AS (
        SELECT rad.id, rad.created_at, rsi.user_vocabulary_id
        FROM review_agent_decisions rad
        INNER JOIN review_sessions rs ON rs.id = rad.review_session_id
        INNER JOIN review_answers original_answer ON original_answer.id = rad.review_answer_id
        INNER JOIN review_session_items rsi ON rsi.id = original_answer.review_session_item_id
        WHERE rs.user_id = ${userId}::uuid
          AND rad.kind = 'ANSWER_INTERVENTION'::review_decision_kind
          AND rad.created_at >= ${from} AND rad.created_at < ${to}
          AND rsi.user_vocabulary_id IS NOT NULL
      )
      SELECT 'NEXT_DAY'::text AS horizon, COUNT(follow_up.is_correct)::bigint AS "followUps",
        COUNT(*) FILTER (WHERE follow_up.is_correct = TRUE)::bigint AS correct
      FROM interventions intervention
      LEFT JOIN LATERAL (
        SELECT later_answer.is_correct FROM review_answers later_answer
        INNER JOIN review_session_items later_item ON later_item.id = later_answer.review_session_item_id
        INNER JOIN review_sessions later_session ON later_session.id = later_item.review_session_id
        WHERE later_session.user_id = ${userId}::uuid
          AND later_item.user_vocabulary_id = intervention.user_vocabulary_id
          AND later_answer.answered_at >= intervention.created_at + INTERVAL '1 day'
          AND later_answer.answered_at < intervention.created_at + INTERVAL '2 days'
          AND later_answer.answered_at < ${to}
        ORDER BY later_answer.answered_at, later_answer.id LIMIT 1
      ) follow_up ON TRUE
      WHERE intervention.created_at <= ${to}::timestamptz - INTERVAL '2 days'
      UNION ALL
      SELECT 'SEVEN_DAY'::text AS horizon, COUNT(follow_up.is_correct)::bigint AS "followUps",
        COUNT(*) FILTER (WHERE follow_up.is_correct = TRUE)::bigint AS correct
      FROM interventions intervention
      LEFT JOIN LATERAL (
        SELECT later_answer.is_correct FROM review_answers later_answer
        INNER JOIN review_session_items later_item ON later_item.id = later_answer.review_session_item_id
        INNER JOIN review_sessions later_session ON later_session.id = later_item.review_session_id
        WHERE later_session.user_id = ${userId}::uuid
          AND later_item.user_vocabulary_id = intervention.user_vocabulary_id
          AND later_answer.answered_at >= intervention.created_at + INTERVAL '7 days'
          AND later_answer.answered_at < intervention.created_at + INTERVAL '8 days'
          AND later_answer.answered_at < ${to}
        ORDER BY later_answer.answered_at, later_answer.id LIMIT 1
      ) follow_up ON TRUE
      WHERE intervention.created_at <= ${to}::timestamptz - INTERVAL '8 days'
    `);
  }

  queryTrend(userId: string, from: Date, to: Date, groupBy: AnalyticsGroupBy) {
    return this.prisma.$queryRaw<ReviewTrendEvaluationRow[]>(Prisma.sql`
      SELECT ${bucketExpression(Prisma.sql`ra.answered_at`, groupBy, this.appConfig.analyticsTimezone)} AS bucket,
        COUNT(*)::bigint AS answers,
        COUNT(*) FILTER (WHERE ra.is_correct = TRUE)::bigint AS "correctAnswers",
        COUNT(ra.response_time_ms)::bigint AS "timedAnswers",
        COALESCE(SUM(ra.response_time_ms), 0)::bigint AS "responseTimeTotalMs",
        COALESCE(SUM(ra.hints_used), 0)::bigint AS "hintsUsed"
      FROM review_answers ra
      INNER JOIN review_session_items rsi ON rsi.id = ra.review_session_item_id
      INNER JOIN review_sessions rs ON rs.id = rsi.review_session_id
      WHERE rs.user_id = ${userId}::uuid
        AND ra.answered_at >= ${from} AND ra.answered_at < ${to}
      GROUP BY 1 ORDER BY 1 ASC
    `);
  }
}
