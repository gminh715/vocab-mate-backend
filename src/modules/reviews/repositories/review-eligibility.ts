import { Prisma } from '../../../../generated/prisma/client';
import { LearningStatus } from '../../../../generated/prisma/enums';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';

const REVIEW_ELIGIBLE_LEARNING_STATUSES = [
  LearningStatus.NEW,
  LearningStatus.LEARNING,
  LearningStatus.REVIEWING,
];

type ReviewTimezone = ReturnTypeOfAppConfig['analyticsTimezone'];

const zonedDateTimeParts = (instant: Date, timezone: ReviewTimezone) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
};

const reviewDayBoundary = (
  now: Date,
  timezone: ReviewTimezone,
  dayOffset: 0 | 1,
): Date => {
  const localNow = zonedDateTimeParts(now, timezone);
  const localBoundaryAsUtc = Date.UTC(
    localNow.year,
    localNow.month - 1,
    localNow.day + dayOffset,
  );
  let reviewDayBoundaryMs = localBoundaryAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = zonedDateTimeParts(
      new Date(reviewDayBoundaryMs),
      timezone,
    );
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    const adjustmentMs = localBoundaryAsUtc - renderedAsUtc;
    reviewDayBoundaryMs += adjustmentMs;
    if (adjustmentMs === 0) break;
  }

  return new Date(reviewDayBoundaryMs);
};

export const reviewDayStart = (now: Date, timezone: ReviewTimezone): Date =>
  reviewDayBoundary(now, timezone, 0);

export const reviewDayEnd = (now: Date, timezone: ReviewTimezone): Date =>
  reviewDayBoundary(now, timezone, 1);

export const reviewEligibilityWhere = (
  userId: string,
  now: Date,
  timezone: ReviewTimezone,
): Prisma.UserVocabularyWhereInput => ({
  userId,
  learningStatus: { in: REVIEW_ELIGIBLE_LEARNING_STATUSES },
  savedAt: { lt: reviewDayStart(now, timezone) },
  OR: [
    { nextReviewAt: { lt: reviewDayEnd(now, timezone) } },
    { nextReviewAt: null },
  ],
});

export const reviewEligibilitySql = (
  userId: string,
  now: Date,
  timezone: ReviewTimezone,
) => Prisma.sql`
  uv.user_id = ${userId}::uuid
  AND uv.learning_status IN (
    ${Prisma.join(
      REVIEW_ELIGIBLE_LEARNING_STATUSES.map(
        (status) => Prisma.sql`${status}::learning_status`,
      ),
    )}
  )
  AND uv.saved_at < ${reviewDayStart(now, timezone)}
  AND (
    uv.next_review_at < ${reviewDayEnd(now, timezone)}
    OR uv.next_review_at IS NULL
  )
`;
