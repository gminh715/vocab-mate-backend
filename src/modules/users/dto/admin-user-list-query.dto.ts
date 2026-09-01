import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums';

export enum AdminUserSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AdminUserListQueryDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;

  @ApiProperty({ example: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit!: number;

  @ApiPropertyOptional({ example: 'nguyen', maxLength: 320 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  q?: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, example: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    enum: AdminUserSort,
    example: AdminUserSort.NEWEST,
    default: AdminUserSort.NEWEST,
  })
  @IsOptional()
  @IsEnum(AdminUserSort)
  sort: AdminUserSort = AdminUserSort.NEWEST;
}
