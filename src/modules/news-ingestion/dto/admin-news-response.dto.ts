import { ApiProperty } from '@nestjs/swagger';

export class NormalizedNewsArticleDto {
  @ApiProperty()
  externalId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ format: 'uri', nullable: true })
  imageUrl!: string | null;

  @ApiProperty()
  sourceName!: string;

  @ApiProperty({ format: 'date-time' })
  publishedAt!: Date;

  @ApiProperty({ nullable: true })
  authorName!: string | null;

  @ApiProperty({ nullable: true, example: 'technology' })
  sectionId!: string | null;

  @ApiProperty({ nullable: true, example: 'Technology' })
  sectionName!: string | null;
}

export class AdminNewsSearchDataDto {
  @ApiProperty({ minimum: 0 })
  totalArticles!: number;

  @ApiProperty({ type: [NormalizedNewsArticleDto] })
  articles!: NormalizedNewsArticleDto[];
}

export class AdminNewsSearchSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminNewsSearchDataDto })
  data!: AdminNewsSearchDataDto;
}

export class NewsSyncItemDto {
  @ApiProperty({ enum: ['imported', 'skippedDuplicate', 'failed'] })
  status!: 'imported' | 'skippedDuplicate' | 'failed';

  @ApiProperty()
  externalId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ format: 'uri' })
  canonicalUrl!: string;

  @ApiProperty({ format: 'uuid', required: false })
  articleId?: string;

  @ApiProperty({ required: false })
  errorCode?: string;

  @ApiProperty({ required: false })
  errorMessage?: string;
}

export class NewsSyncCountsDto {
  @ApiProperty({ minimum: 0 })
  discovered!: number;

  @ApiProperty({ minimum: 0 })
  imported!: number;

  @ApiProperty({ minimum: 0 })
  skippedDuplicate!: number;

  @ApiProperty({ minimum: 0 })
  failed!: number;
}

export class AdminNewsSyncDataDto {
  @ApiProperty({ type: NewsSyncCountsDto })
  counts!: NewsSyncCountsDto;

  @ApiProperty({ type: [NewsSyncItemDto] })
  items!: NewsSyncItemDto[];
}

export class AdminNewsSyncSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminNewsSyncDataDto })
  data!: AdminNewsSyncDataDto;
}
