import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';
import { PublicUserDto } from '../../auth/dto/auth-response.dto';
import { MyAccountDto } from './my-profile-response.dto';

/** Swagger response schemas for administrative user operations. */
export class AdminUserListItemDto extends PublicUserDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  displayName!: string;
  @ApiProperty({ format: 'date-time', nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class AdminUserListDataDto {
  @ApiProperty({ type: [AdminUserListItemDto] })
  items!: AdminUserListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class AdminUserListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminUserListDataDto })
  data!: AdminUserListDataDto;
}

export class AdminUserAccountDto extends MyAccountDto {
  @ApiProperty({ format: 'date-time', nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class LearningSummaryDto {
  @ApiProperty({ example: 24 })
  savedVocabularyCount!: number;

  @ApiProperty({ example: 5 })
  completedArticleCount!: number;
}

export class AdminUserDetailDataDto {
  @ApiProperty({ type: AdminUserAccountDto })
  user!: AdminUserAccountDto;

  @ApiProperty({ type: LearningSummaryDto })
  learningSummary!: LearningSummaryDto;
}

export class AdminUserDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminUserDetailDataDto })
  data!: AdminUserDetailDataDto;
}

export class UpdatedUserStatusDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.SUSPENDED })
  status!: UserStatus;

  @ApiProperty({ format: 'date-time', example: '2026-07-22T10:00:00Z' })
  updatedAt!: Date;
}

export class UpdateUserStatusSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: UpdatedUserStatusDto })
  data!: UpdatedUserStatusDto;
}

export class UpdatedUserRoleDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
  role!: UserRole;

  @ApiProperty({ format: 'date-time', example: '2026-07-22T10:00:00Z' })
  updatedAt!: Date;
}

export class UpdateUserRoleSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: UpdatedUserRoleDto })
  data!: UpdatedUserRoleDto;
}
