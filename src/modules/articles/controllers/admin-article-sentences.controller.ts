import { Controller } from '@nestjs/common';
import { ArticleSentencesService } from '../services/article-sentences.service';

@Controller('admin/articles/sentences')
export class AdminArticleSentencesController {
  constructor(
    private readonly articleSentencesService: ArticleSentencesService,
  ) {}
}
