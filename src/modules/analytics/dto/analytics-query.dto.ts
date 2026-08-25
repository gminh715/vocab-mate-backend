import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { UserStatus } from '../../../../generated/prisma/enums';

const DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/u;

export enum AnalyticsGroupBy {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export class AnalyticsDateRangeQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-06-24T00:00:00Z',
    description:
      'Inclusive range start as an ISO 8601 instant with a UTC offset. Defaults to 30 days before to.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(OFFSET_SUFFIX, { message: 'from must include a UTC offset' })
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-07-24T00:00:00Z',
    description:
      'Exclusive range end as an ISO 8601 instant with a UTC offset. Defaults to the captured request time.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(OFFSET_SUFFIX, { message: 'to must include a UTC offset' })
  to?: string;
}

export class VocabularyAnalyticsQueryDto extends AnalyticsDateRangeQueryDto {
  @ApiPropertyOptional({
    enum: AnalyticsGroupBy,
    description:
      'Trend bucket size. Defaults to DAY for ranges up to 31 days, WEEK for ranges up to 180 days, and MONTH otherwise.',
  })
  @IsOptional()
  @IsEnum(AnalyticsGroupBy)
  groupBy?: AnalyticsGroupBy;
}

export class AdminContentAnalyticsQueryDto extends AnalyticsDateRangeQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Restricts every content metric to this category, including inactive categories and archived article history.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class AdminUserAnalyticsQueryDto extends AnalyticsDateRangeQueryDto {
  @ApiPropertyOptional({
    enum: UserStatus,
    description: 'Applies this account-status filter to every returned metric.',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export interface ResolvedAnalyticsDateRange {
  from: Date;
  to: Date;
}

export const resolveAnalyticsDateRange = (
  query: AnalyticsDateRangeQueryDto,
  now: Date,
): ResolvedAnalyticsDateRange => {
  const suppliedFrom = query.from ? new Date(query.from) : undefined;
  const suppliedTo = query.to ? new Date(query.to) : undefined;
  const to = suppliedTo ?? now;
  const from =
    suppliedFrom ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to
  ) {
    throw new BadRequestException('from must be before to');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new BadRequestException(
      `Analytics date range cannot exceed ${MAX_RANGE_DAYS} days`,
    );
  }

  return { from, to };
};

export const resolveAnalyticsGroupBy = (
  range: ResolvedAnalyticsDateRange,
  requested?: AnalyticsGroupBy,
): AnalyticsGroupBy => {
  if (requested) return requested;
  const rangeDays = (range.to.getTime() - range.from.getTime()) / DAY_MS;
  if (rangeDays <= 31) return AnalyticsGroupBy.DAY;
  if (rangeDays <= 180) return AnalyticsGroupBy.WEEK;
  return AnalyticsGroupBy.MONTH;
};
