import { Injectable } from '@nestjs/common';
import {
  LearningStatus,
  QuestionType,
} from '../../../../generated/prisma/enums';

export const SLOW_RESPONSE_THRESHOLD_MS = 30_000;
export const MAX_REVIEW_INTERVAL_DAYS = 60;
export const MASTERED_MINIMUM_INTERVAL_DAYS = 21;
export const MASTERED_MINIMUM_SUCCESS_STREAK = 4;
const MILLISECONDS_PER_DAY = 86_400_000;
const SMALLINT_MAX = 32_767;

export interface ReviewScoreInput {
  isCorrect: boolean;
  isSkipped?: boolean;
  previousFailedAttempts: number;
  hintsUsed: number;
  questionType: QuestionType;
  responseTimeMs: number | null;
}

export interface VocabularyReviewState {
  learningStatus: LearningStatus;
  reviewIntervalDays: number | null;
  consecutiveCorrectReviews: number;
  lapseCount: number;
}

export interface ReviewSchedule {
  learningStatus: LearningStatus;
  reviewIntervalDays: number;
  lastReviewedAt: Date;
  nextReviewAt: Date;
  consecutiveCorrectReviews: number;
  lapseCount: number;
  lastReviewScore: number;
}

const nextReviewInterval = (score: number, currentInterval: number): number => {
  let interval: number;
  if (score <= 2) {
    interval = 1;
  } else if (score === 3) {
    interval = Math.max(currentInterval + 1, Math.ceil(currentInterval * 1.25));
  } else if (score === 4) {
    interval = currentInterval * 2;
  } else {
    interval = Math.ceil(currentInterval * 2.5);
  }
  return Math.min(interval, MAX_REVIEW_INTERVAL_DAYS);
};

export const scheduleReview = (
  score: number,
  current: VocabularyReviewState,
  now: Date,
  forgottenThisAttempt: boolean,
): ReviewSchedule => {
  const normalizedScore = Math.min(Math.max(Math.trunc(score), 0), 5);
  const currentInterval = Math.min(
    Math.max(current.reviewIntervalDays ?? 1, 1),
    MAX_REVIEW_INTERVAL_DAYS,
  );
  const successful = normalizedScore >= 2;
  const nextInterval = nextReviewInterval(normalizedScore, currentInterval);
  const nextStreak = successful
    ? Math.min(current.consecutiveCorrectReviews + 1, SMALLINT_MAX)
    : 0;
  const mastered =
    successful &&
    nextStreak >= MASTERED_MINIMUM_SUCCESS_STREAK &&
    nextInterval >= MASTERED_MINIMUM_INTERVAL_DAYS;
  const incrementLapse =
    normalizedScore <= 1 &&
    forgottenThisAttempt &&
    (current.learningStatus === LearningStatus.LEARNING ||
      current.learningStatus === LearningStatus.REVIEWING ||
      current.learningStatus === LearningStatus.MASTERED);

  return {
    learningStatus: successful
      ? mastered
        ? LearningStatus.MASTERED
        : LearningStatus.REVIEWING
      : LearningStatus.LEARNING,
    reviewIntervalDays: nextInterval,
    lastReviewedAt: now,
    nextReviewAt: new Date(now.getTime() + nextInterval * MILLISECONDS_PER_DAY),
    consecutiveCorrectReviews: nextStreak,
    lapseCount: incrementLapse
      ? Math.min(current.lapseCount + 1, SMALLINT_MAX)
      : current.lapseCount,
    lastReviewScore: normalizedScore,
  };
};

@Injectable()
export class InvisibleReviewScoringService {
  inferScore(input: ReviewScoreInput): number {
    if (!input.isCorrect || input.isSkipped === true) return 0;

    let score: number;
    if (input.previousFailedAttempts > 0) {
      score = 2;
    } else if (input.hintsUsed > 0) {
      score = 3;
    } else if (input.questionType === QuestionType.FILL_BLANK) {
      score = 5;
    } else {
      score = 4;
    }

    if (
      input.responseTimeMs !== null &&
      input.responseTimeMs > SLOW_RESPONSE_THRESHOLD_MS
    ) {
      score -= 1;
    }
    return Math.max(score, 0);
  }

  schedule(
    score: number,
    current: VocabularyReviewState,
    now: Date,
    forgottenThisAttempt: boolean,
  ): ReviewSchedule {
    return scheduleReview(score, current, now, forgottenThisAttempt);
  }
}
