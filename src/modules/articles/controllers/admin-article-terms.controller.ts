import { Controller } from '@nestjs/common';
import { ArticleTermsService } from '../services/article-terms.service';

@Controller('admin/articles/terms')
export class AdminArticleTermsController {
  constructor(private readonly articleTermsService: ArticleTermsService) {}
}
