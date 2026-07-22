import { Injectable } from '@nestjs/common';
import { ArticlesRepository } from '../repositories/articles.repository';

@Injectable()
export class ArticleContentService {
  constructor(private readonly articlesRepository: ArticlesRepository) {}
}
