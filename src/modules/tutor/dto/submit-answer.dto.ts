import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SubmitAnswerDto {
  @ApiProperty({
    example: 'A',
    description:
      'User response: option ID (e.g. "A", "B", "C", "D") for MULTIPLE_CHOICE, or typed text string for CLOZE/TYPED_RECALL',
  })
  @IsNotEmpty()
  answer!: unknown;

  @ApiProperty({
    example: false,
    description: 'Whether the learner opened/viewed the hint for this question',
  })
  @IsBoolean()
  hintUsed!: boolean;

  @ApiPropertyOptional({
    example: 4500,
    minimum: 0,
    maximum: 600_000,
    description:
      'Time elapsed in milliseconds between question display and submission',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  responseTimeMs?: number;
}

export class TutorSessionParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  sessionId!: string;
}

export class TutorSessionItemParamsDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  itemId!: string;
}
