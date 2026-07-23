import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, ValidateIf } from 'class-validator';
import { ArticleStatus, CefrLevel } from '../../../../generated/prisma/enums';
import { PublicCategoryDto } from '../../categories/dto/category-response.dto';
import { ArticleSentenceTermDto } from './article-sentence.dto';

const isSupplied = (_object: object, value: unknown): boolean =>
  value !== undefined;

export class ArticlePreviewQueryDto {
  @ApiPropertyOptional({
    enum: CefrLevel,
    description:
      'Simulates highlighting terms at or above this CEFR level. Defaults to the article level.',
  })
  @ValidateIf(isSupplied)
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;
}

export class PublicationValidationIssueDto {
  @ApiProperty({ example: 'MISSING_SENTENCE_MARKER' })
  code!: string;

  @ApiProperty({
    example: 'An active current-version sentence has no HTML marker.',
  })
  message!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  entityId?: string;
}

export class ArticlePublishDataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ArticleStatus, example: ArticleStatus.PUBLISHED })
  status!: ArticleStatus;

  @ApiProperty({ format: 'date-time' })
  publishedAt!: Date;
}

export class ArticlePublishSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticlePublishDataDto })
  data!: ArticlePublishDataDto;
}

export class ArticleArchiveDataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ArticleStatus, example: ArticleStatus.ARCHIVED })
  status!: ArticleStatus;

  @ApiProperty({ format: 'date-time' })
  archivedAt!: Date;
}

export class ArticleArchiveSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleArchiveDataDto })
  data!: ArticleArchiveDataDto;
}

export class ArticleRestoreDraftDataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ArticleStatus, example: ArticleStatus.DRAFT })
  status!: ArticleStatus;
}

export class ArticleRestoreDraftSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleRestoreDraftDataDto })
  data!: ArticleRestoreDraftDataDto;
}

export class ArticlePreviewMetadataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ nullable: true })
  sourceName!: string | null;

  @ApiProperty({ nullable: true })
  sourceUrl!: string | null;

  @ApiProperty({ nullable: true })
  authorName!: string | null;

  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;

  @ApiProperty({ enum: CefrLevel })
  cefrLevel!: CefrLevel;

  @ApiProperty({ enum: ArticleStatus })
  status!: ArticleStatus;

  @ApiProperty({ minimum: 1 })
  contentVersion!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;
}

export class ArticlePreviewTermDto extends ArticleSentenceTermDto {
  @ApiProperty()
  isHighlighted!: boolean;
}

export class ArticlePreviewDataDto {
  @ApiProperty({ type: ArticlePreviewMetadataDto })
  article!: ArticlePreviewMetadataDto;

  @ApiProperty()
  contentHtml!: string;

  @ApiProperty({ type: [ArticlePreviewTermDto] })
  terms!: ArticlePreviewTermDto[];

  @ApiProperty({ type: [PublicationValidationIssueDto] })
  validationWarnings!: PublicationValidationIssueDto[];
}

export class ArticlePreviewSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticlePreviewDataDto })
  data!: ArticlePreviewDataDto;
}

export class PublicationValidationErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({
    example: {
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Article failed publication validation',
      issues: [
        {
          code: 'MISSING_PARSE',
          message: 'The current content version has not been parsed.',
        },
      ],
    },
  })
  error!: {
    code: string;
    message: string;
    issues: PublicationValidationIssueDto[];
  };
}
