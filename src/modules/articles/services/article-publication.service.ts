import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ArticleStatus,
  CefrLevel,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import { isCefrAtOrAbove } from '../../../common/utils/cefr-level.util';
import { HtmlSanitizerHelper } from '../helpers/html-sanitizer.helper';
import {
  ArticleStatusTransitionConflictError,
  type ArticlePublicationSnapshot,
  ArticlesRepository,
} from '../repositories/articles.repository';
import { ArticlePublicationValidator } from '../validators/article-publication.validator';

@Injectable()
export class ArticlePublicationService {
  constructor(
    private readonly articlesRepository: ArticlesRepository,
    private readonly articlePublicationValidator: ArticlePublicationValidator,
  ) {}

  async publish(actingAdminId: string, articleId: string) {
    const snapshot = await this.requireSnapshot(articleId);
    if (snapshot.article.status === ArticleStatus.PUBLISHED) {
      throw new ConflictException('Article is already published');
    }
    if (snapshot.article.status !== ArticleStatus.DRAFT) {
      throw new ConflictException('Only a draft article can be published');
    }

    const issues = this.articlePublicationValidator.validate(snapshot);
    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Article failed publication validation',
        issues,
      });
    }

    const publishedAt = new Date();
    try {
      const article = await this.articlesRepository.transitionArticleStatus({
        articleId,
        expectedStatus: ArticleStatus.DRAFT,
        expectedContentVersion: snapshot.article.contentVersion,
        expectedContentHtml: snapshot.article.contentHtml,
        requireActiveCategory: true,
        status: ArticleStatus.PUBLISHED,
        publishedAt,
        archivedAt: null,
        updatedByUserId: actingAdminId,
      });
      if (!article.publishedAt) {
        throw new ArticleStatusTransitionConflictError();
      }
      return {
        id: article.id,
        status: article.status,
        publishedAt: article.publishedAt,
      };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  async archive(actingAdminId: string, articleId: string) {
    const snapshot = await this.requireSnapshot(articleId);
    if (snapshot.article.status === ArticleStatus.ARCHIVED) {
      throw new ConflictException('Article is already archived');
    }
    if (
      snapshot.article.status !== ArticleStatus.DRAFT &&
      snapshot.article.status !== ArticleStatus.PUBLISHED
    ) {
      throw new ConflictException('Article cannot be archived from this state');
    }

    try {
      const article = await this.articlesRepository.transitionArticleStatus({
        articleId,
        expectedStatus: snapshot.article.status,
        expectedContentVersion: snapshot.article.contentVersion,
        expectedContentHtml: snapshot.article.contentHtml,
        status: ArticleStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedByUserId: actingAdminId,
      });
      if (!article.archivedAt) {
        throw new ArticleStatusTransitionConflictError();
      }
      return {
        id: article.id,
        status: article.status,
        archivedAt: article.archivedAt,
      };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  async restoreDraft(actingAdminId: string, articleId: string) {
    const snapshot = await this.requireSnapshot(articleId);
    if (snapshot.article.status !== ArticleStatus.ARCHIVED) {
      throw new ConflictException('Only an archived article can be restored');
    }

    try {
      const article = await this.articlesRepository.transitionArticleStatus({
        articleId,
        expectedStatus: ArticleStatus.ARCHIVED,
        expectedContentVersion: snapshot.article.contentVersion,
        expectedContentHtml: snapshot.article.contentHtml,
        status: ArticleStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
        updatedByUserId: actingAdminId,
      });
      return { id: article.id, status: article.status };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  async preview(articleId: string, selectedCefrLevel?: CefrLevel) {
    const snapshot = await this.requireSnapshot(articleId);
    if (snapshot.article.status === ArticleStatus.ARCHIVED) {
      throw new ConflictException('Archived articles cannot be previewed');
    }

    const previewLevel = selectedCefrLevel ?? snapshot.article.cefrLevel;
    const {
      contentHtml,
      archivedAt: _archivedAt,
      categoryId: _categoryId,
      category,
      ...article
    } = snapshot.article;
    void _archivedAt;
    void _categoryId;

    const terms = snapshot.sentences.flatMap((sentence) =>
      sentence.isActive
        ? sentence.terms
            .filter((term) => term.isActive && term.isLookupEnabled)
            .filter((term) => term.reviewStatus === TermReviewStatus.APPROVED)
            .map((term) => ({
              ...term,
              isHighlighted:
                term.cefrLevel !== null &&
                isCefrAtOrAbove(term.cefrLevel, previewLevel),
            }))
        : [],
    );

    return {
      article: {
        ...article,
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
        },
      },
      contentHtml: HtmlSanitizerHelper.sanitize(contentHtml),
      terms,
      validationWarnings: this.articlePublicationValidator.validate(snapshot),
    };
  }

  private async requireSnapshot(
    articleId: string,
  ): Promise<ArticlePublicationSnapshot> {
    const snapshot =
      await this.articlesRepository.findPublicationSnapshot(articleId);
    if (!snapshot) throw new NotFoundException('Article not found');
    return snapshot;
  }

  private mapTransitionError(error: unknown): never {
    if (error instanceof ArticleStatusTransitionConflictError) {
      throw new ConflictException(
        'Article state or content changed; retry the request',
      );
    }
    throw error;
  }
}
