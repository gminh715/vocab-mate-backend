import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../common/dto/pagination-meta.dto';
import { VocabularySnapshotDto } from '../../vocabularies/dto/vocabulary-response.dto';

export class CollectionDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440010',
  })
  id!: string;

  @ApiProperty({ example: 'Technology' })
  name!: string;

  @ApiProperty({
    example: 'Words about software and computing.',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-07-23T10:00:00Z' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time', example: '2026-07-23T10:00:00Z' })
  updatedAt!: Date;
}

export class CollectionListItemDto extends CollectionDto {
  @ApiProperty({ example: 12, minimum: 0 })
  vocabularyCount!: number;
}

export class CollectionListDataDto {
  @ApiProperty({ type: [CollectionListItemDto] })
  items!: CollectionListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class CollectionListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CollectionListDataDto })
  data!: CollectionListDataDto;
}

export class CollectionDetailDataDto {
  @ApiProperty({ type: CollectionDto })
  collection!: CollectionDto;

  @ApiProperty({ example: 12, minimum: 0 })
  vocabularyCount!: number;
}

export class CollectionDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CollectionDetailDataDto })
  data!: CollectionDetailDataDto;
}

export class CollectionMutationDataDto {
  @ApiProperty({ type: CollectionDto })
  collection!: CollectionDto;
}

export class CollectionMutationSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CollectionMutationDataDto })
  data!: CollectionMutationDataDto;
}

export class CollectionVocabularyItemDto extends VocabularySnapshotDto {
  @ApiProperty({ format: 'date-time', example: '2026-07-23T10:00:00Z' })
  addedAt!: Date;
}

export class CollectionItemsListDataDto {
  @ApiProperty({ type: [CollectionVocabularyItemDto] })
  items!: CollectionVocabularyItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class CollectionItemsListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CollectionItemsListDataDto })
  data!: CollectionItemsListDataDto;
}

export class CollectionItemsAddDataDto {
  @ApiProperty({
    example: 2,
    minimum: 0,
    description: 'Number of new membership relations inserted.',
  })
  addedCount!: number;

  @ApiProperty({
    example: 1,
    minimum: 0,
    description:
      'Original request length minus addedCount, including repeated and already-existing IDs.',
  })
  skippedCount!: number;
}

export class CollectionItemsAddSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CollectionItemsAddDataDto })
  data!: CollectionItemsAddDataDto;
}
