import { Injectable } from '@nestjs/common';
import { LearningStatus } from '../../../../generated/prisma/enums';

export const FIRST_REVIEW_INTERVAL_DAYS = 1;
export const SECOND_REVIEW_INTERVAL_DAYS = 3;
export const MASTERED_INTERVAL_DAYS = 30;
const MILLISECONDS_PER_DAY = 86_400_000;

export interface ReviewSchedule {
  learningStatus: LearningStatus;
  reviewIntervalDays: number;
  lastReviewedAt: Date;
  nextReviewAt: Date | null;
}

@Injectable()
export class ReviewSchedulerService {
  schedule(
    isCorrect: boolean,
    currentInterval: number | null,
    now: Date,
  ): ReviewSchedule {
    if (!isCorrect) {
      return {
        learningStatus: LearningStatus.LEARNING,
        reviewIntervalDays: FIRST_REVIEW_INTERVAL_DAYS,
        lastReviewedAt: now,
        nextReviewAt: this.addDays(now, FIRST_REVIEW_INTERVAL_DAYS),
      };
    }

    const interval = currentInterval ?? 0;
    const nextInterval =
      interval === 0
        ? FIRST_REVIEW_INTERVAL_DAYS
        : interval === FIRST_REVIEW_INTERVAL_DAYS
          ? SECOND_REVIEW_INTERVAL_DAYS
          : Math.min(interval * 2, MASTERED_INTERVAL_DAYS);
    const mastered = nextInterval >= MASTERED_INTERVAL_DAYS;

    return {
      learningStatus: mastered
        ? LearningStatus.MASTERED
        : LearningStatus.REVIEWING,
      reviewIntervalDays: nextInterval,
      lastReviewedAt: now,
      nextReviewAt: mastered ? null : this.addDays(now, nextInterval),
    };
  }

  private addDays(now: Date, days: number): Date {
    return new Date(now.getTime() + days * MILLISECONDS_PER_DAY);
  }
}
