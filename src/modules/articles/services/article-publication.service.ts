import { Injectable } from '@nestjs/common';
import { ArticlesRepository } from '../repositories/articles.repository';

@Injectable()
export class ArticlePublicationService {
  constructor(private readonly articlesRepository: ArticlesRepository) {}
}
