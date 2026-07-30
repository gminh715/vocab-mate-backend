import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminContentAnalyticsQueryDto,
  AdminUserAnalyticsQueryDto,
  AnalyticsDateRangeQueryDto,
  AnalyticsGroupBy,
  QuizAnalyticsQueryDto,
  resolveAnalyticsDateRange,
  resolveAnalyticsGroupBy,
  VocabularyAnalyticsQueryDto,
} from './analytics-query.dto';

describe('Analytics query contract', () => {
  const now = new Date('2026-07-24T12:00:00Z');

  it('defaults to the captured request time and the preceding 30 days', () => {
    expect(resolveAnalyticsDateRange({}, now)).toEqual({
      from: new Date('2026-06-24T12:00:00Z'),
      to: now,
    });
  });

  it('defaults only to when only from is supplied', () => {
    expect(
      resolveAnalyticsDateRange({ from: '2026-07-01T00:00:00Z' }, now),
    ).toEqual({
      from: new Date('2026-07-01T00:00:00Z'),
      to: now,
    });
  });

  it('defaults from to 30 days before a supplied to', () => {
    expect(
      resolveAnalyticsDateRange({ to: '2026-06-01T00:00:00Z' }, now),
    ).toEqual({
      from: new Date('2026-05-02T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
    });
  });

  it.each([
    ['invalid date', { from: 'not-a-date' }],
    [
      'equal bounds',
      { from: '2026-07-01T00:00:00Z', to: '2026-07-01T00:00:00Z' },
    ],
    [
      'reversed bounds',
      { from: '2026-07-02T00:00:00Z', to: '2026-07-01T00:00:00Z' },
    ],
    [
      'more than 366 days',
      { from: '2025-01-01T00:00:00Z', to: '2026-01-03T00:00:00Z' },
    ],
  ])('rejects %s', (_caseName, query) => {
    expect(() => resolveAnalyticsDateRange(query, now)).toThrow(
      BadRequestException,
    );
  });

  it('requires valid ISO instants with explicit offsets', async () => {
    const invalid = plainToInstance(AnalyticsDateRangeQueryDto, {
      from: '2026-07-01T00:00:00',
      to: 'invalid',
    });
    expect((await validate(invalid)).map(({ property }) => property)).toEqual(
      expect.arrayContaining(['from', 'to']),
    );

    const valid = plainToInstance(AnalyticsDateRangeQueryDto, {
      from: '2026-07-01T07:00:00+07:00',
      to: '2026-07-02T00:00:00Z',
    });
    await expect(validate(valid)).resolves.toHaveLength(0);
  });

  it.each([
    [31, AnalyticsGroupBy.DAY],
    [32, AnalyticsGroupBy.WEEK],
    [180, AnalyticsGroupBy.WEEK],
    [181, AnalyticsGroupBy.MONTH],
  ])('defaults a %i-day range to %s', (days, expected) => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + days * 86_400_000);
    expect(resolveAnalyticsGroupBy({ from, to })).toBe(expected);
  });

  it('honors a validated explicit groupBy and rejects arbitrary values', async () => {
    expect(
      resolveAnalyticsGroupBy(
        {
          from: new Date('2026-01-01T00:00:00Z'),
          to: new Date('2026-01-02T00:00:00Z'),
        },
        AnalyticsGroupBy.MONTH,
      ),
    ).toBe(AnalyticsGroupBy.MONTH);

    const dto = plainToInstance(VocabularyAnalyticsQueryDto, {
      groupBy: 'quarter',
    });
    expect((await validate(dto)).map(({ property }) => property)).toContain(
      'groupBy',
    );
  });

  it.each([
    [QuizAnalyticsQueryDto, { articleId: 'not-a-uuid' }, 'articleId'],
    [AdminContentAnalyticsQueryDto, { categoryId: 'not-a-uuid' }, 'categoryId'],
    [AdminUserAnalyticsQueryDto, { status: 'DELETED' }, 'status'],
  ])('validates focused analytics filters on %p', async (Dto, input, field) => {
    const dto = plainToInstance(Dto, input);
    expect((await validate(dto)).map(({ property }) => property)).toContain(
      field,
    );
  });
});
