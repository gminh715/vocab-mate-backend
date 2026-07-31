import { ApiProperty } from '@nestjs/swagger';
import {
  AiGenerationStatus,
  CefrLevel,
} from '../../../../generated/prisma/enums';
import { PublicCategoryDto } from '../../categories/dto/category-response.dto';

export class ArticleAnalysisDataDto {
  @ApiProperty({ format: 'uuid' })
  articleId!: string;

  @ApiProperty({ minimum: 1 })
  contentVersion!: number;

  @ApiProperty({
    enum: AiGenerationStatus,
    example: AiGenerationStatus.READY,
  })
  aiAnalysisStatus!: AiGenerationStatus;

  @ApiProperty({ type: PublicCategoryDto })
  category!: PublicCategoryDto;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  cefrLevel!: CefrLevel;

  @ApiProperty({ minimum: 0 })
  candidateCount!: number;
}

export class ArticleAnalysisSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ArticleAnalysisDataDto })
  data!: ArticleAnalysisDataDto;
}
