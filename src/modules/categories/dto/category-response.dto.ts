import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../users/dto/admin-response.dto';

export class PublicCategoryDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ example: 'Technology' })
  name!: string;

  @ApiProperty({ example: 'technology' })
  slug!: string;
}

export class CategoryListDataDto {
  @ApiProperty({ type: [PublicCategoryDto] })
  items!: PublicCategoryDto[];
}

export class CategoryListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CategoryListDataDto })
  data!: CategoryListDataDto;
}

export class CategoryDetailDataDto {
  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;
}

export class CategoryDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CategoryDetailDataDto })
  data!: CategoryDetailDataDto;
}

export class AdminCategoryDto extends PublicCategoryDto {
  @ApiProperty({ example: 'Technology articles', nullable: true })
  description!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 1, minimum: 0 })
  displayOrder!: number;

  @ApiProperty({ format: 'date-time', example: '2026-07-22T10:00:00Z' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time', example: '2026-07-22T10:00:00Z' })
  updatedAt!: Date;
}

export class AdminCategoryListDataDto {
  @ApiProperty({ type: [AdminCategoryDto] })
  items!: AdminCategoryDto[];
}

export class AdminCategoryListSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminCategoryListDataDto })
  data!: AdminCategoryListDataDto;

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class AdminCategoryDetailDataDto {
  @ApiProperty({ type: AdminCategoryDto })
  category!: AdminCategoryDto;

  @ApiProperty({ example: 12, minimum: 0 })
  articleCount!: number;
}

export class AdminCategoryDetailSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AdminCategoryDetailDataDto })
  data!: AdminCategoryDetailDataDto;
}

export class CategoryMutationDataDto {
  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;
}

export class CategoryMutationSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CategoryMutationDataDto })
  data!: CategoryMutationDataDto;
}

export class CategoryStatusDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ example: false })
  isActive!: boolean;
}

export class CategoryStatusSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: CategoryStatusDto })
  data!: CategoryStatusDto;
}
