import { LearningStatus } from '../../../../generated/prisma/enums';
import {
  MASTERED_INTERVAL_DAYS,
  ReviewSchedulerService,
} from './review-scheduler.service';

describe('ReviewSchedulerService', () => {
  const service = new ReviewSchedulerService();
  const now = new Date('2026-07-24T00:00:00.000Z');

  it('resets an incorrect answer to one day', () => {
    expect(service.schedule(false, 12, now)).toEqual({
      learningStatus: LearningStatus.LEARNING,
      reviewIntervalDays: 1,
      lastReviewedAt: now,
      nextReviewAt: new Date('2026-07-25T00:00:00.000Z'),
    });
  });

  it.each([
    [null, 1],
    [0, 1],
    [1, 3],
    [3, 6],
    [10, 20],
  ])('advances correct interval %s to %s', (current, expected) => {
    expect(service.schedule(true, current, now)).toMatchObject({
      learningStatus: LearningStatus.REVIEWING,
      reviewIntervalDays: expected,
    });
  });

  it('caps at and marks the mastered threshold without another due date', () => {
    expect(service.schedule(true, 20, now)).toEqual({
      learningStatus: LearningStatus.MASTERED,
      reviewIntervalDays: MASTERED_INTERVAL_DAYS,
      lastReviewedAt: now,
      nextReviewAt: null,
    });
  });
});
