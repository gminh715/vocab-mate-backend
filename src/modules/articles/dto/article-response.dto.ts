import { ApiProperty } from '@nestjs/swagger';
import { ArticleStatus, CefrLevel } from '../../../../generated/prisma/enums';
import { PublicCategoryDto } from '../../categories/dto/category-response.dto';
import { PaginationMetaDto } from '../../users/dto/admin-response.dto';

export class PublicArticleCardDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ example: 'How Technology Changes Learning' })
  title!: string;

  @ApiProperty({ example: 'how-technology-changes-learning' })
  slug!: string;

  @ApiProperty({ example: 'A concise introduction to technology in learning.' })
  summary!: string;

  @ApiProperty({
    example: 'https://cdn.example.com/articles/technology.jpg',
    nullable: true,
  })
  thumbnailUrl!: string | null;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  cefrLevel!: CefrLevel;

  @ApiProperty({
    format: 'date-time',
    example: '2026-07-22T10:00:00Z',
    nullable: true,
  })
  publishedAt!: Date | null;

  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;
}

export class PublicArticleMetadataDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ example: 'How Technology Changes Learning' })
  title!: string;

  @ApiProperty({ example: 'how-technology-changes-learning' })
  slug!: string;

  @ApiProperty({ example: 'A concise introduction to technology in learning.' })
  summary!: string;

  @ApiProperty({ example: 'Vocab Mate News', nullable: true })
  sourceName!: string | null;

  @ApiProperty({ example: 'https://example.com/original', nullable: true })
  sourceUrl!: string | null;

  @ApiProperty({ example: 'Jane Doe', nullable: true })
  authorName!: string | null;

  @ApiProperty({
    example: 'https://cdn.example.com/articles/technology.jpg',
    nullable: true,
  })
  thumbnailUrl!: string | null;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  cefrLevel!: CefrLevel;

  @ApiProperty({ enum: ArticleStatus, example: ArticleStatus.PUBLISHED })
  status!: ArticleStatus;

  @ApiProperty({
    format: 'date-time',
    example: '2026-07-22T10:00:00Z',
    nullable: true,
  })
  publishedAt!: Date | null;
}

export class ArticleListDataDto {
  @ApiProperty({ type: [PublicArticleCardDto] })
  items!: PublicArticleCardDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ArticleListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleListDataDto })
  data!: ArticleListDataDto;
}

export class ArticleDetailDataDto {
  @ApiProperty({ type: PublicArticleMetadataDto })
  article!: PublicArticleMetadataDto;

  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;

  @ApiProperty({ example: 2, minimum: 0 })
  quizCount!: number;
}

export class ArticleDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleDetailDataDto })
  data!: ArticleDetailDataDto;
}

export class AdminArticleListItemDto extends PublicArticleCardDto {
  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty({ enum: ArticleStatus, example: ArticleStatus.DRAFT })
  status!: ArticleStatus;

  @ApiProperty({ example: 1, minimum: 1 })
  contentVersion!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class AdminArticleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty({ example: 'How Technology Changes Learning' })
  title!: string;

  @ApiProperty({ example: 'how-technology-changes-learning' })
  slug!: string;

  @ApiProperty({ example: 'A concise introduction.' })
  summary!: string;

  @ApiProperty({ example: '<p>Article content</p>' })
  contentHtml!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  contentVersion!: number;

  @ApiProperty({ nullable: true })
  sourceName!: string | null;

  @ApiProperty({ nullable: true })
  sourceUrl!: string | null;

  @ApiProperty({ nullable: true })
  authorName!: string | null;

  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  cefrLevel!: CefrLevel;

  @ApiProperty({ enum: ArticleStatus, example: ArticleStatus.DRAFT })
  status!: ArticleStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;
}

export class AdminArticleListDataDto {
  @ApiProperty({ type: [AdminArticleListItemDto] })
  items!: AdminArticleListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class AdminArticleListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminArticleListDataDto })
  data!: AdminArticleListDataDto;
}

export class AdminArticleDetailDataDto {
  @ApiProperty({ type: AdminArticleDto })
  article!: AdminArticleDto;

  @ApiProperty({ example: 12, minimum: 0 })
  sentenceCount!: number;

  @ApiProperty({ example: 30, minimum: 0 })
  termCount!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  quizCount!: number;
}

export class AdminArticleDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminArticleDetailDataDto })
  data!: AdminArticleDetailDataDto;
}

export class ArticleMutationDataDto {
  @ApiProperty({ type: AdminArticleDto })
  article!: AdminArticleDto;
}

export class ArticleMutationSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleMutationDataDto })
  data!: ArticleMutationDataDto;
}

export class ArticleUpdateDataDto extends ArticleMutationDataDto {
  @ApiProperty({ example: true })
  contentChanged!: boolean;
}

export class ArticleUpdateSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleUpdateDataDto })
  data!: ArticleUpdateDataDto;
}
