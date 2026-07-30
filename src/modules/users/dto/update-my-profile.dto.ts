import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
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

  @ApiPropertyOptional({ enum: CefrLevel, example: CefrLevel.B2 })
  @ValidateIf(isSupplied)
  @IsEnum(CefrLevel)
  learningGoal?: CefrLevel;

  @ApiPropertyOptional({ enum: ['vi', 'en'], example: 'vi' })
  @ValidateIf(isSupplied)
  @IsIn(['vi', 'en'])
  preferredLanguage?: string;
}
