import { Controller } from '@nestjs/common';
import { ArticlesService } from '../services/articles.service';

@Controller('admin/articles')
export class AdminArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}
}
