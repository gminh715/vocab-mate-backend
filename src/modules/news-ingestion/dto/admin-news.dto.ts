import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmpty,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  GUARDIAN_ORDER_BY,
  type GuardianOrderBy,
} from '../news-ingestion.types';

const MAX_QUERY_LENGTH = 200;
const MAX_SECTION_LENGTH = 100;
const MAX_PAGE = 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const GUARDIAN_SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

@ValidatorConstraint({ name: 'hasNewsDiscoveryCriterion', async: false })
class HasNewsDiscoveryCriterionConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as { q?: unknown; section?: unknown };
    return (
      (typeof object.q === 'string' && object.q.trim().length > 0) ||
      (typeof object.section === 'string' && object.section.length > 0)
    );
  }

  defaultMessage(): string {
    return 'q or section is required';
  }
}

@ValidatorConstraint({ name: 'hasValidNewsDateRange', async: false })
class HasValidNewsDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as { fromDate?: unknown; toDate?: unknown };
    return (
      typeof object.fromDate !== 'string' ||
      typeof object.toDate !== 'string' ||
      object.fromDate.localeCompare(object.toDate) <= 0
    );
  }

  defaultMessage(): string {
    return 'fromDate must not be after toDate';
  }
}

class NewsDiscoveryFieldsDto {
  @ApiPropertyOptional({ maxLength: MAX_QUERY_LENGTH })
  @ValidateIf(isSupplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    example: 'technology',
    maxLength: MAX_SECTION_LENGTH,
    description: 'Guardian section ID',
  })
  @ValidateIf(isSupplied)
  @Transform(lower)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SECTION_LENGTH)
  @Matches(GUARDIAN_SECTION_ID)
  section?: string;

  @IsEmpty()
  @Validate(HasNewsDiscoveryCriterionConstraint)
  private readonly discoveryCriterion?: never;

  @ApiPropertyOptional({ format: 'date', example: '2026-07-01' })
  @ValidateIf(isSupplied)
  @Transform(trim)
  @Matches(ISO_DATE)
  @IsDateString({ strict: true })
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-07-31' })
  @ValidateIf(isSupplied)
  @Transform(trim)
  @Matches(ISO_DATE)
  @IsDateString({ strict: true })
  toDate?: string;

  @IsEmpty()
  @Validate(HasValidNewsDateRangeConstraint)
  private readonly dateRange?: never;

  @ApiPropertyOptional({ enum: GUARDIAN_ORDER_BY, default: 'newest' })
  @Transform(lower)
  @IsIn(GUARDIAN_ORDER_BY)
  orderBy: GuardianOrderBy = 'newest';
}

export class AdminNewsSearchQueryDto extends NewsDiscoveryFieldsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_PAGE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page = 1;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  pageSize = 5;
}

export class AdminNewsSyncDto extends NewsDiscoveryFieldsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  defaultCategoryId!: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  pageSize = 5;
}
