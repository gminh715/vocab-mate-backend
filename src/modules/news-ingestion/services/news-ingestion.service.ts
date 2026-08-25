import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { logInfo, logWarn } from '../../../common/logging/structured-logger';
import { ArticleSentencesService } from '../../articles/services/article-sentences.service';
import {
  ArticlesService,
  ImportedArticleDuplicateError,
} from '../../articles/services/articles.service';
import { CategoriesService } from '../../categories/services/categories.service';
import type {
  AdminNewsSearchQueryDto,
  AdminNewsSyncDto,
} from '../dto/admin-news.dto';
import { GuardianClient } from '../guardian.client';
import { NewsContentService } from './news-content.service';
import { NewsIngestionError } from '../news-ingestion.errors';
import type {
  GuardianImportResult,
  GuardianSearchResult,
  NormalizedNewsArticle,
  NormalizedNewsImportArticle,
} from '../news-ingestion.types';

const IMPORT_SOURCE = 'guardian';
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_SLUG_LENGTH = 200;

export interface NewsSyncItem {
  status: 'imported' | 'skippedDuplicate' | 'failed';
  externalId: string;
  title: string;
  canonicalUrl: string;
  articleId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface NewsSyncResult {
  counts: {
    discovered: number;
    imported: number;
    skippedDuplicate: number;
    failed: number;
  };
  items: NewsSyncItem[];
}

const normalizedContentHash = (contentHtml: string): string =>
  createHash('sha256')
    .update(
      contentHtml
        .normalize('NFC')
        .replace(/>\s+</gu, '><')
        .replace(/\s+/gu, ' ')
        .trim(),
      'utf8',
    )
    .digest('hex');

const importSlug = (
  title: string,
  externalId: string,
  canonicalUrl: string,
): string => {
  const suffix = createHash('sha256')
    .update(`${IMPORT_SOURCE}\0${externalId || canonicalUrl}`, 'utf8')
    .digest('hex')
    .slice(0, 12);
  const maximumBaseLength = MAX_SLUG_LENGTH - suffix.length - 1;
  const base =
    title
      .normalize('NFKD')
      .replace(/\p{Mark}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, maximumBaseLength)
      .replace(/-+$/u, '') || 'article';
  return `${base}-${suffix}`;
};

const boundedSummary = (
  article: NormalizedNewsArticle,
  plainText: string,
): string =>
  (article.description.trim() || plainText.trim())
    .replace(/\s+/gu, ' ')
    .slice(0, MAX_SUMMARY_LENGTH)
    .trim();

@Injectable()
export class NewsIngestionService {
  constructor(
    private readonly guardianClient: GuardianClient,
    private readonly newsContentService: NewsContentService,
    private readonly articlesService: ArticlesService,
    private readonly articleSentencesService: ArticleSentencesService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async search(query: AdminNewsSearchQueryDto): Promise<GuardianSearchResult> {
    try {
      return await this.guardianClient.searchMetadata(query);
    } catch (error: unknown) {
      this.throwPublicProviderError(error);
    }
  }

  async sync(
    actingAdminId: string,
    dto: AdminNewsSyncDto,
  ): Promise<NewsSyncResult> {
    if (
      !Number.isInteger(dto.pageSize) ||
      dto.pageSize < 1 ||
      dto.pageSize > 10
    ) {
      throw new BadRequestException('Invalid news sync criteria');
    }

    if (dto.defaultCategoryId) {
      await this.categoriesService.requireActiveCategory(dto.defaultCategoryId);
    }

    let discovered: GuardianImportResult;
    try {
      discovered = await this.guardianClient.searchForImport({
        q: dto.q,
        section: dto.section,
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        pageSize: dto.pageSize,
        orderBy: dto.orderBy,
        articleIds: dto.articleIds,
      });
    } catch (error: unknown) {
      this.throwPublicProviderError(error);
    }

    const items: NewsSyncItem[] = [];
    for (const article of discovered?.articles ?? []) {
      items.push(
        await this.importOne(actingAdminId, dto.defaultCategoryId, article),
      );
    }

    const result = {
      counts: {
        discovered: items.length,
        imported: items.filter(({ status }) => status === 'imported').length,
        skippedDuplicate: items.filter(
          ({ status }) => status === 'skippedDuplicate',
        ).length,
        failed: items.filter(({ status }) => status === 'failed').length,
      },
      items,
    };
    logInfo('news.ingestion.sync.completed', {
      source: IMPORT_SOURCE,
      requestedArticleCount: dto.articleIds?.length ?? null,
      ...result.counts,
    });
    return result;
  }

  private async importOne(
    actingAdminId: string,
    defaultCategoryId: string | undefined,
    article: NormalizedNewsImportArticle,
  ): Promise<NewsSyncItem> {
    const base = {
      externalId: article.externalId,
      title: article.title,
      canonicalUrl: article.url,
    };
    let createdArticleId: string | undefined;

    try {
      if (
        await this.articlesService.findImportedDuplicate({
          importSource: IMPORT_SOURCE,
          externalId: article.externalId,
        })
      ) {
        return { ...base, status: 'skippedDuplicate' };
      }
      if (
        await this.articlesService.findImportedDuplicate({
          canonicalUrl: article.url,
        })
      ) {
        return { ...base, status: 'skippedDuplicate' };
      }

      const extracted = this.newsContentService.resolve(article);

      const contentHash = normalizedContentHash(extracted.contentHtml);
      if (await this.articlesService.findImportedDuplicate({ contentHash })) {
        return {
          ...base,
          canonicalUrl: extracted.canonicalUrl,
          status: 'skippedDuplicate',
        };
      }

      const categoryId =
        defaultCategoryId ??
        (await this.categoriesService.resolveOrCreateImportCategory(
          actingAdminId,
          article.sectionId,
          article.sectionName,
        ));

      const { article: created } =
        await this.articlesService.createImportedDraft(actingAdminId, {
          categoryId,
          title: article.title,
          slug: importSlug(
            article.title,
            article.externalId,
            extracted.canonicalUrl,
          ),
          summary: boundedSummary(article, extracted.plainText),
          contentHtml: extracted.contentHtml,
          importSource: IMPORT_SOURCE,
          externalId: article.externalId,
          canonicalUrl: extracted.canonicalUrl,
          contentHash,
          sourcePublishedAt: article.publishedAt,
          sourceName: 'The Guardian',
          sourceUrl: article.url,
          ...(article.imageUrl ? { thumbnailUrl: article.imageUrl } : {}),
          ...(article.authorName ? { authorName: article.authorName } : {}),
        });
      createdArticleId = created.id;

      await this.articleSentencesService.parseContent(
        actingAdminId,
        created.id,
        {},
      );

      return {
        ...base,
        canonicalUrl: extracted.canonicalUrl,
        status: 'imported',
        articleId: created.id,
      };
    } catch (error: unknown) {
      if (error instanceof ImportedArticleDuplicateError) {
        return { ...base, status: 'skippedDuplicate' };
      }

      if (createdArticleId) {
        try {
          await this.articlesService.delete(actingAdminId, createdArticleId);
        } catch {
          const result: NewsSyncItem = {
            ...base,
            status: 'failed',
            errorCode: 'IMPORT_CLEANUP_FAILED',
            errorMessage: 'Imported draft could not be safely finalized',
          };
          logWarn('news.ingestion.item_failed', {
            source: IMPORT_SOURCE,
            externalId: article.externalId,
            errorCode: result.errorCode,
          });
          return result;
        }
      }

      const result: NewsSyncItem = {
        ...base,
        status: 'failed',
        ...this.safeItemError(error),
      };
      logWarn('news.ingestion.item_failed', {
        source: IMPORT_SOURCE,
        externalId: article.externalId,
        errorCode: result.errorCode,
      });
      return result;
    }
  }

  private safeItemError(error: unknown): {
    errorCode: string;
    errorMessage: string;
  } {
    if (error instanceof NewsIngestionError) {
      return { errorCode: error.code, errorMessage: error.message };
    }
    if (error instanceof HttpException && error.getStatus() < 500) {
      return {
        errorCode: 'ARTICLE_IMPORT_REJECTED',
        errorMessage: 'Article content could not be imported',
      };
    }
    return {
      errorCode: 'ARTICLE_IMPORT_FAILED',
      errorMessage: 'Article import failed',
    };
  }

  private throwPublicProviderError(error: unknown): never {
    if (!(error instanceof NewsIngestionError)) throw error;
    if (error.code === 'NEWS_PROVIDER_BAD_REQUEST') {
      throw new BadRequestException(error.message);
    }
    if (error.code === 'NEWS_PROVIDER_RATE_LIMIT') {
      throw new HttpException(
        'News provider rate limit was exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (
      error.code === 'NEWS_PROVIDER_AUTHENTICATION' ||
      error.code === 'NEWS_PROVIDER_QUOTA'
    ) {
      throw new ServiceUnavailableException(
        'News provider configuration is unavailable',
      );
    }
    throw new BadGatewayException('News provider request failed');
  }
}
