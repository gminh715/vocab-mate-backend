import { ApiProperty } from '@nestjs/swagger';

export class RatingDistributionDto {
  @ApiProperty({ example: 1, description: 'Count of Again (1) ratings' })
  again!: number;

  @ApiProperty({ example: 2, description: 'Count of Hard (2) ratings' })
  hard!: number;

  @ApiProperty({ example: 5, description: 'Count of Good (3) ratings' })
  good!: number;

  @ApiProperty({ example: 2, description: 'Count of Easy (4) ratings' })
  easy!: number;
}

export class TutorSessionSummaryStatsDto {
  @ApiProperty({
    example: 450,
    description: 'Actual session duration in seconds',
  })
  durationSeconds!: number;

  @ApiProperty({
    example: 10,
    description: 'Target activity count planned for the session',
  })
  plannedActivities!: number;

  @ApiProperty({
    example: 10,
    description: 'Actual number of activities completed',
  })
  completedActivities!: number;

  @ApiProperty({ example: 8, description: 'Count of correct answers' })
  correctCount!: number;

  @ApiProperty({ example: 2, description: 'Count of incorrect answers' })
  incorrectCount!: number;

  @ApiProperty({ example: 2, description: 'Number of NEW words studied' })
  newWordsStudied!: number;

  @ApiProperty({
    example: 8,
    description: 'Number of review/learning words studied',
  })
  reviewWordsStudied!: number;

  @ApiProperty({
    type: RatingDistributionDto,
    description: 'Distribution of FSRS ratings assigned',
  })
  ratingDistribution!: RatingDistributionDto;

  @ApiProperty({
    type: [String],
    example: ['meticulous', 'aberrant'],
    description: 'Words that lapsed or entered relearning during this session',
  })
  relearningWords!: string[];

  @ApiProperty({
    example: 3,
    description:
      'Total vocabulary items currently due for review after this session',
  })
  nextDueCount!: number;
}
