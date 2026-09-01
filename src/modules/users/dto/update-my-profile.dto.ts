import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CefrLevel } from '../../../../generated/prisma/enums';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;

export class UpdateMyProfileDto {
  @ApiPropertyOptional({
    example: 'Nguyen Van A',
    minLength: 1,
    maxLength: 100,
  })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.png',
    format: 'uri',
  })
  @ValidateIf(isSupplied)
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({
    enum: CefrLevel,
    example: CefrLevel.B1,
    nullable: true,
  })
  @ValidateIf((_obj, val) => val !== undefined && val !== null)
  @IsEnum(CefrLevel)
  currentCefrLevel?: CefrLevel | null;

  @ApiPropertyOptional({ enum: CefrLevel, example: CefrLevel.B2 })
  @ValidateIf(isSupplied)
  @IsEnum(CefrLevel)
  learningGoal?: CefrLevel;

  @ApiPropertyOptional({
    enum: ['vi', 'en'],
    example: 'vi',
    description:
      'UI display-language preference only; does not control articles, translations, explanations, or AI output.',
  })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsIn(['vi', 'en'])
  preferredLanguage?: string;

  @ApiPropertyOptional({
    enum: [5, 10, 15, 20],
    example: 10,
    description:
      'Daily study session duration in minutes. Must be 5, 10, 15, or 20.',
  })
  @ValidateIf(isSupplied)
  @IsInt()
  @IsIn([5, 10, 15, 20])
  dailyStudyMinutes?: number;
}
