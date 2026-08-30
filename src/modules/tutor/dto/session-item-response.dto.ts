import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TutorQuestionType,
  TutorSessionItemStatus,
  TutorSessionStatus,
} from '../../../../generated/prisma/enums';

export class TutorSessionPendingItemDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  sessionId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
    nullable: true,
    description: 'Associated UserVocabulary ID (null if deleted)',
  })
  userVocabularyId!: string | null;

  @ApiProperty({
    example: 1,
    description: '1-based sequential position within the session',
  })
  position!: number;

  @ApiProperty({
    enum: TutorSessionItemStatus,
    example: TutorSessionItemStatus.PENDING,
  })
  status!: TutorSessionItemStatus;

  @ApiProperty({
    enum: TutorQuestionType,
    example: TutorQuestionType.MULTIPLE_CHOICE,
  })
  questionType!: TutorQuestionType;

  @ApiProperty({
    example: false,
    description: 'Whether this activity is for a NEW word',
  })
  isNewWord!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      questionPromptVi: 'Chọn nghĩa đúng nhất của từ sau',
      wordDisplay: 'harmful',
      meaningVi: 'có hại, gây tổn hại',
      options: [
        { id: 'A', text: 'có hại, gây tổn hại' },
        { id: 'B', text: 'có lợi, hữu ích' },
        { id: 'C', text: 'nhanh chóng' },
        { id: 'D', text: 'chính xác' },
      ],
    },
    description:
      'Public activity payload rendered by frontend (never contains answer keys)',
  })
  questionPayload!: Record<string, unknown>;

  @ApiProperty({
    example: false,
    description: 'Whether the user requested a hint',
  })
  hintUsed!: boolean;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: Date;
}

export class TutorSessionAnsweredItemDto extends TutorSessionPendingItemDto {
  @ApiPropertyOptional({
    description:
      'User-provided answer (option ID for MC, string for typed/cloze)',
    example: 'A',
  })
  userAnswer!: unknown;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the submitted answer was correct',
  })
  isCorrect!: boolean | null;

  @ApiPropertyOptional({
    example: 3200,
    nullable: true,
    description: 'Response time in milliseconds',
  })
  responseTimeMs!: number | null;

  @ApiPropertyOptional({
    example: 3,
    nullable: true,
    description: 'FSRS rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)',
  })
  fsrsRating!: number | null;

  @ApiPropertyOptional({
    example: 'Chính xác! "harmful" có nghĩa là có hại.',
    nullable: true,
    description: 'Contextual feedback in Vietnamese',
  })
  feedbackVi!: string | null;

  @ApiPropertyOptional({
    example: 'A',
    description:
      'Canonical correct answer (only exposed after the item has been answered)',
  })
  correctAnswer!: unknown;

  @ApiPropertyOptional({
    example: '"harmful" là tính từ mang nghĩa gây tổn hại hoặc có hại.',
    nullable: true,
    description:
      'Detailed explanation in Vietnamese (only exposed after answered)',
  })
  explanationVi!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  answeredAt!: Date | null;
}

export class SubmitAnswerResponseDataDto {
  @ApiProperty({
    type: TutorSessionAnsweredItemDto,
    description: 'The answered item with grading result',
  })
  item!: TutorSessionAnsweredItemDto;

  @ApiProperty({ enum: TutorSessionStatus, example: TutorSessionStatus.ACTIVE })
  sessionStatus!: TutorSessionStatus;

  @ApiProperty({
    example: false,
    description:
      'True if this submission completed the target activity quota for the session',
  })
  isSessionCompleted!: boolean;
}

export class SubmitAnswerSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: SubmitAnswerResponseDataDto })
  data!: SubmitAnswerResponseDataDto;
}
