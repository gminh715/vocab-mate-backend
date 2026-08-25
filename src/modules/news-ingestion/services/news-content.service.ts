import { Inject, Injectable } from '@nestjs/common';
import { DomUtils, parseDocument } from 'htmlparser2';
import type { NewsConfig } from '../../../config/news.config';
import { NEWS_CONFIG } from '../../../config/config.module';
import { ArticleContentService } from '../../articles/services/article-content.service';
import { NewsIngestionError } from '../news-ingestion.errors';
import type {
  ExtractedArticleContent,
  NormalizedNewsImportArticle,
} from '../news-ingestion.types';

const PLACEHOLDERS = new Set([
  '[removed]',
  'content unavailable',
  'content is unavailable',
  'not available',
  'n/a',
  'null',
  'read full article',
  'read the full article',
]);
const PLACEHOLDER_PREFIX =
  /^(?:content (?:is )?unavailable|not available|read (?:the )?full article|click here to read)/iu;

const plainTextFromHtml = (value: string): string =>
  DomUtils.textContent(parseDocument(value, { decodeEntities: true }))
    .replace(/\s+/gu, ' ')
    .trim();

const bodyUnavailable = () =>
  new NewsIngestionError(
    'GUARDIAN_BODY_UNAVAILABLE',
    'Guardian article body is unavailable',
  );

@Injectable()
export class NewsContentService {
  constructor(
    @Inject(NEWS_CONFIG) private readonly config: NewsConfig,
    private readonly articleContentService: ArticleContentService,
  ) {}

  resolve(article: NormalizedNewsImportArticle): ExtractedArticleContent {
    const providerContent = article.providerContent;
    if (
      !providerContent ||
      !providerContent.trim() ||
      new TextEncoder().encode(providerContent).byteLength >
        this.config.maxResponseBytes
    ) {
      throw bodyUnavailable();
    }

    const rawPlainText = plainTextFromHtml(providerContent);
    if (this.isPlaceholder(rawPlainText)) throw bodyUnavailable();

    let contentHtml: string;
    try {
      contentHtml = this.articleContentService.sanitize(providerContent);
    } catch {
      throw bodyUnavailable();
    }

    const plainText = plainTextFromHtml(contentHtml);
    if (
      plainText.length < this.config.minArticleCharacters ||
      !/\p{L}/u.test(plainText) ||
      this.isPlaceholder(plainText)
    ) {
      throw bodyUnavailable();
    }

    return {
      contentHtml,
      plainText,
      canonicalUrl: article.url,
    };
  }

  private isPlaceholder(value: string): boolean {
    const normalized = value.replace(/\s+/gu, ' ').trim().toLowerCase();
    return (
      !normalized ||
      PLACEHOLDERS.has(normalized) ||
      PLACEHOLDER_PREFIX.test(normalized)
    );
  }
}
