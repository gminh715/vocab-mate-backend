import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
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

  @ApiPropertyOptional({ enum: CefrLevel, example: CefrLevel.B1 })
  @ValidateIf(isSupplied)
  @IsEnum(CefrLevel)
  currentCefrLevel?: CefrLevel;

  @ApiPropertyOptional({ example: 'Learn 10 words per day', maxLength: 500 })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  learningGoal?: string;

  @ApiPropertyOptional({ example: 'vi', minLength: 2, maxLength: 20 })
  @ValidateIf(isSupplied)
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  preferredLanguage?: string;
}
