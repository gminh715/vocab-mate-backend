import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TutorSessionStatus } from '../../../../generated/prisma/enums';
import {
  TutorSessionAnsweredItemDto,
  TutorSessionPendingItemDto,
} from './session-item-response.dto';
import { TutorSessionSummaryStatsDto } from './session-summary-stats.dto';

export class TutorSessionSummaryDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  userId!: string;

  @ApiProperty({
    example: '2026-08-30',
    description: 'Study date in Asia/Ho_Chi_Minh timezone',
  })
  studyDate!: string;

  @ApiProperty({ enum: TutorSessionStatus, example: TutorSessionStatus.ACTIVE })
  status!: TutorSessionStatus;

  @ApiProperty({
    example: 10,
    description: 'Target session duration in minutes',
  })
  targetDurationMinutes!: number;

  @ApiProperty({
    example: 13,
    description: 'Target total activity count for the session',
  })
  targetActivityCount!: number;

  @ApiProperty({
    example: 3,
    description: 'Target number of NEW words to introduce',
  })
  newWordTarget!: number;

  @ApiProperty({ format: 'date-time' })
  startedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class TutorSessionWithItemDataDto {
  @ApiProperty({ type: TutorSessionSummaryDto })
  session!: TutorSessionSummaryDto;

  @ApiPropertyOptional({
    type: TutorSessionPendingItemDto,
    nullable: true,
    description:
      'The current PENDING question to be answered (null if completed/abandoned)',
  })
  currentItem!: TutorSessionPendingItemDto | null;

  @ApiPropertyOptional({
    type: TutorSessionSummaryStatsDto,
    nullable: true,
    description:
      'Session summary stats (populated when session is COMPLETED or ABANDONED)',
  })
  summary!: TutorSessionSummaryStatsDto | null;
}

export class TutorSessionSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: TutorSessionWithItemDataDto })
  data!: TutorSessionWithItemDataDto;
}

export class TutorSessionDetailDataDto {
  @ApiProperty({ type: TutorSessionSummaryDto })
  session!: TutorSessionSummaryDto;

  @ApiProperty({
    type: [TutorSessionAnsweredItemDto],
    description: 'All items in the session in sequential order',
  })
  items!: TutorSessionAnsweredItemDto[];

  @ApiPropertyOptional({
    type: TutorSessionSummaryStatsDto,
    nullable: true,
    description: 'Summary statistics for this session',
  })
  summary!: TutorSessionSummaryStatsDto | null;
}

export class TutorSessionDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: TutorSessionDetailDataDto })
  data!: TutorSessionDetailDataDto;
}
