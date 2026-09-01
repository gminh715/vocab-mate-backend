import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TutorSessionSummaryDto } from './session-response.dto';

const MAX_HISTORY_LIMIT = 50;

export class TutorHistoryQueryDto {
  @ApiPropertyOptional({
    example:
      'eyJzdHVkeURhdGUiOiIyMDI2LTA4LTI5IiwiaWQiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAifQ==',
    description: 'Opaque cursor string for keyset pagination',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: MAX_HISTORY_LIMIT,
    default: 20,
    description: 'Number of sessions to retrieve per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit: number = 20;
}

export class TutorHistoryDataDto {
  @ApiProperty({
    type: [TutorSessionSummaryDto],
    description: 'Paginated list of completed/historical sessions',
  })
  items!: TutorSessionSummaryDto[];

  @ApiPropertyOptional({
    example:
      'eyJzdHVkeURhdGUiOiIyMDI2LTA4LTI4IiwiaWQiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDEifQ==',
    nullable: true,
    description:
      'Next cursor for fetching the following page, or null if no further pages exist',
  })
  nextCursor!: string | null;

  @ApiProperty({
    example: false,
    description: 'True if more historical sessions remain after this page',
  })
  hasMore!: boolean;
}

export class TutorHistorySuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: TutorHistoryDataDto })
  data!: TutorHistoryDataDto;
}
