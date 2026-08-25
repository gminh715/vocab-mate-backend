import { Prisma } from '../../../generated/prisma/client';
import type { ReturnTypeOfAppConfig } from '../../config/app.config';
import { AnalyticsGroupBy } from './dto/analytics-query.dto';

const DAY_MS = 86_400_000;

export type AnalyticsNumericValue = Prisma.Decimal | bigint | number | string;

export const toSafeCount = (value: AnalyticsNumericValue): number => {
  const normalized =
    value instanceof Prisma.Decimal ? value.toFixed(0) : value.toString();
  const count = BigInt(normalized);
  if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Analytics count is outside the safe integer range');
  }
  return Number(count);
};

export const roundRatio = (numerator: number, denominator: number): number =>
  denominator === 0
    ? 0
    : Math.round((numerator / denominator) * 10_000) / 10_000;

export const toRatio = (value: AnalyticsNumericValue | null): number => {
  if (value === null) return 0;
  const numberValue =
    value instanceof Prisma.Decimal ? value.toNumber() : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new RangeError('Analytics ratio is not finite');
  }
  return Math.min(1, Math.max(0, Math.round(numberValue * 10_000) / 10_000));
};

export const bucketExpression = (
  timestamp: Prisma.Sql,
  groupBy: AnalyticsGroupBy,
  timezone: ReturnTypeOfAppConfig['analyticsTimezone'],
): Prisma.Sql => {
  const unit = {
    [AnalyticsGroupBy.DAY]: Prisma.sql`'day'`,
    [AnalyticsGroupBy.WEEK]: Prisma.sql`'week'`,
    [AnalyticsGroupBy.MONTH]: Prisma.sql`'month'`,
  }[groupBy];
  return Prisma.sql`
    to_char(
      date_trunc(${unit}, ${timestamp} AT TIME ZONE ${timezone}),
      'YYYY-MM-DD'
    )
  `;
};

export const fillMissingBuckets = <Row extends { bucket: string }, Result>(
  rows: Row[],
  from: Date,
  to: Date,
  groupBy: AnalyticsGroupBy,
  timezone: ReturnTypeOfAppConfig['analyticsTimezone'],
  map: (row: Row) => Result,
  empty: (bucket: string) => Result,
): Result[] => {
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  const start = normalizeBucketDate(localCalendarDate(from, timezone), groupBy);
  const end = normalizeBucketDate(
    localCalendarDate(new Date(to.getTime() - 1), timezone),
    groupBy,
  );
  const buckets: Result[] = [];
  for (
    let current = start;
    current.getTime() <= end.getTime();
    current = incrementBucket(current, groupBy)
  ) {
    const bucket = current.toISOString().slice(0, 10);
    const row = byBucket.get(bucket);
    buckets.push(row ? map(row) : empty(bucket));
  }
  return buckets;
};

const localCalendarDate = (
  instant: Date,
  timezone: ReturnTypeOfAppConfig['analyticsTimezone'],
): Date => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
};

const normalizeBucketDate = (date: Date, groupBy: AnalyticsGroupBy): Date => {
  if (groupBy === AnalyticsGroupBy.MONTH) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }
  if (groupBy === AnalyticsGroupBy.WEEK) {
    const day = date.getUTCDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    return new Date(date.getTime() - daysFromMonday * DAY_MS);
  }
  return date;
};

const incrementBucket = (date: Date, groupBy: AnalyticsGroupBy): Date => {
  const next = new Date(date);
  if (groupBy === AnalyticsGroupBy.MONTH) {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else {
    next.setUTCDate(
      next.getUTCDate() + (groupBy === AnalyticsGroupBy.WEEK ? 7 : 1),
    );
  }
  return next;
};
