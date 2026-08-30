import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TutorSessionSummaryDto } from './session-response.dto';

export class TodayStatusDataDto {
  @ApiProperty({
    example: true,
    description:
      'Whether the user is eligible to start a new tutor session today',
  })
  canStart!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether there is an active session today that can be resumed',
  })
  canResume!: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether the user has already completed their daily session today',
  })
  isCompletedToday!: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether today session was abandoned (blocks starting a second session)',
  })
  isAbandoned!: boolean;

  @ApiProperty({
    example: 5,
    description: 'Number of vocabulary items currently due for review',
  })
  dueCount!: number;

  @ApiPropertyOptional({
    type: TutorSessionSummaryDto,
    nullable: true,
    description: 'Today session summary if one exists, otherwise null',
  })
  session!: TutorSessionSummaryDto | null;
}

export class TodayStatusSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: TodayStatusDataDto })
  data!: TodayStatusDataDto;
}
