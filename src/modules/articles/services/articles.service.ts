import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
} from '../../../../generated/prisma/enums';
import { CategoriesRepository } from '../../categories/categories.repository';
import type { GetArticlesQueryDto } from '../dto/get-articles-query.dto';
import { normalizeCategorySlug } from '../../categories/dto/get-categories-query.dto';
import type {
  AdminArticleListQueryDto,
  CreateArticleDto,
  UpdateArticleDto,
} from '../dto/admin-article.dto';
import {
  type AdminArticleDetailRecord,
  type AdminArticleListRecord,
  type AdminArticleRecord,
  ArticlesRepository,
  type CreateImportedArticleInput,
  type ImportedArticleDuplicateLookup,
  type PublicArticleCardRecord,
  type PublicArticleDetailRecord,
  type UpdateArticleInput,
} from '../repositories/articles.repository';
import { ArticleContentService } from './article-content.service';

const hasPrismaCode = (
  error: unknown,
  code: 'P2002' | 'P2003' | 'P2025',
): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

export interface PublicArticleListResponse {
  items: PublicArticleCardRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminArticleListResponse {
  items: AdminArticleListRecord[];
  meta: PublicArticleListResponse['meta'];
}

export class ImportedArticleDuplicateError extends Error {
  constructor() {
    super('Imported article already exists');
  }
}

export interface ImportedDraftInput extends Omit<
  CreateImportedArticleInput,
  | 'contentHtml'
  | 'cefrLevel'
  | 'aiAnalysisStatus'
  | 'createdByUserId'
  | 'updatedByUserId'
> {
  contentHtml: string;
}

@Injectable()
export class ArticlesService {
  constructor(
    private readonly articlesRepository: ArticlesRepository,
    private readonly articleContentService: ArticleContentService,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  async findAll(
    query: GetArticlesQueryDto,
  ): Promise<PublicArticleListResponse> {
    const q = query.q?.trim();
    const result = await this.articlesRepository.findPublished({
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      ...(q ? { q } : {}),
      ...(query.categorySlug
        ? { categorySlug: normalizeCategorySlug(query.categorySlug) }
        : {}),
      ...(query.cefrLevel ? { cefrLevel: query.cefrLevel } : {}),
    });

    return {
      items: result.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOneBySlug(slug: string): Promise<PublicArticleDetailRecord> {
    const article = await this.articlesRepository.findPublishedBySlug(
      normalizeCategorySlug(slug),
    );

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return article;
  }

  async findAllAdmin(
    query: AdminArticleListQueryDto,
  ): Promise<AdminArticleListResponse> {
    const q = query.q?.trim();
    const result = await this.articlesRepository.findAdminArticles({
      page: query.page,
      limit: query.limit,
      sort: query.sort ?? 'newest',
      ...(q ? { q } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.cefrLevel ? { cefrLevel: query.cefrLevel } : {}),
      ...(query.status ? { status: query.status } : {}),
    });

    return {
      items: result.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOneAdmin(articleId: string): Promise<AdminArticleDetailRecord> {
    const detail =
      await this.articlesRepository.findAdminArticleDetail(articleId);

    if (!detail) throw new NotFoundException('Article not found');
    return detail;
  }

  async create(
    actingAdminId: string,
    dto: CreateArticleDto,
  ): Promise<{ article: AdminArticleRecord }> {
    await this.requireActiveCategory(dto.categoryId);

    try {
      const article = await this.articlesRepository.create({
        categoryId: dto.categoryId,
        title: dto.title.trim(),
        slug: normalizeCategorySlug(dto.slug),
        summary: dto.summary.trim(),
        contentHtml: this.articleContentService.sanitize(dto.contentHtml),
        cefrLevel: dto.cefrLevel,
        ...(dto.sourceName === undefined
          ? {}
          : { sourceName: dto.sourceName.trim() }),
        ...(dto.sourceUrl === undefined
          ? {}
          : { sourceUrl: dto.sourceUrl.trim() }),
        ...(dto.authorName === undefined
          ? {}
          : { authorName: dto.authorName.trim() }),
        ...(dto.thumbnailUrl === undefined
          ? {}
          : { thumbnailUrl: dto.thumbnailUrl.trim() }),
        createdByUserId: actingAdminId,
        updatedByUserId: actingAdminId,
      });

      return { article };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async requireActiveImportCategory(categoryId?: string): Promise<void> {
    if (!categoryId) return;
    await this.requireActiveCategory(categoryId);
  }

  async resolveCategoryForSection(
    actingAdminId: string,
    sectionId?: string | null,
    sectionName?: string | null,
    defaultCategoryId?: string | null,
  ): Promise<string> {
    if (defaultCategoryId) {
      const active = await this.categoriesRepository.findActiveById(
        defaultCategoryId,
      );
      if (active) return active.id;
    }

    const rawSlug = sectionId?.trim() || sectionName?.trim() || 'general';
    const slug = normalizeCategorySlug(rawSlug);

    const existingBySlug =
      await this.categoriesRepository.findActiveBySlug(slug);
    if (existingBySlug) return existingBySlug.id;

    const allCategories = await this.categoriesRepository.findAdminCategories({
      page: 1,
      limit: 100,
    });
    const match = allCategories.items.find(
      (c) =>
        c.slug === slug ||
        c.name.toLowerCase() ===
          (sectionName || sectionId || '').trim().toLowerCase(),
    );
    if (match) return match.id;

    const name = sectionName?.trim() || sectionId?.trim() || 'General';
    const created = await this.categoriesRepository.create({
      name,
      slug,
      isActive: true,
      displayOrder: 0,
      createdByUserId: actingAdminId,
      updatedByUserId: actingAdminId,
    });
    return created.id;
  }

  findImportedDuplicate(
    lookup: ImportedArticleDuplicateLookup,
  ): Promise<{ id: string } | null> {
    return this.articlesRepository.findImportedDuplicate(lookup);
  }

  async createImportedDraft(
    actingAdminId: string,
    input: ImportedDraftInput,
  ): Promise<{ article: AdminArticleRecord }> {
    try {
      const article = await this.articlesRepository.createImported({
        ...input,
        contentHtml: this.articleContentService.sanitize(input.contentHtml),
        cefrLevel: CefrLevel.B1,
        aiAnalysisStatus: AiGenerationStatus.PENDING,
        createdByUserId: actingAdminId,
        updatedByUserId: actingAdminId,
      });
      return { article };
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ImportedArticleDuplicateError();
      }
      this.mapWriteError(error);
    }
  }

  async update(
    actingAdminId: string,
    articleId: string,
    dto: UpdateArticleDto,
  ): Promise<{ article: AdminArticleRecord; contentChanged: boolean }> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one article field is required');
    }

    const state = await this.articlesRepository.findMutationState(articleId);
    if (!state) throw new NotFoundException('Article not found');
    if (state.status === ArticleStatus.ARCHIVED) {
      throw new ConflictException('Archived articles cannot be updated');
    }
    if (dto.categoryId !== undefined) {
      await this.requireActiveCategory(dto.categoryId);
    }

    const sanitizedContent =
      dto.contentHtml === undefined
        ? undefined
        : this.articleContentService.sanitize(dto.contentHtml);
    const contentChanged =
      sanitizedContent !== undefined && sanitizedContent !== state.contentHtml;
    const input = this.toUpdateInput(actingAdminId, dto);

    try {
      const article = contentChanged
        ? await this.articlesRepository.updateContent(
            articleId,
            state.contentVersion,
            { ...input, contentHtml: sanitizedContent },
            state.status === ArticleStatus.DRAFT,
          )
        : await this.articlesRepository.update(articleId, input);

      return { article, contentChanged };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async delete(actingAdminId: string, articleId: string): Promise<void> {
    // The hard-deleted record has no surviving audit field. The verified actor
    // remains explicit at the service boundary for authorization traceability.
    void actingAdminId;

    const safety = await this.articlesRepository.findDeleteSafety(articleId);
    if (!safety) throw new NotFoundException('Article not found');

    const hasHistory =
      safety.readingProgressCount > 0 ||
      safety.savedVocabularyCount > 0 ||
      safety.quizCount > 0 ||
      safety.reviewSessionCount > 0 ||
      safety.reviewAnswerCount > 0;
    if (safety.status !== ArticleStatus.DRAFT || hasHistory) {
      throw new ConflictException(
        'Only unused draft articles can be deleted; archive this article instead',
      );
    }

    try {
      await this.articlesRepository.delete(articleId);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2003')) {
        throw new ConflictException(
          'Article has learning history or references; archive it instead',
        );
      }
      this.mapWriteError(error);
    }
  }

  private async requireActiveCategory(categoryId: string): Promise<void> {
    const category = await this.categoriesRepository.findActiveById(categoryId);
    if (!category) {
      throw new NotFoundException('Active category not found');
    }
  }

  private toUpdateInput(
    actingAdminId: string,
    dto: UpdateArticleDto,
  ): UpdateArticleInput {
    return {
      ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
      ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
      ...(dto.slug === undefined
        ? {}
        : { slug: normalizeCategorySlug(dto.slug) }),
      ...(dto.summary === undefined ? {} : { summary: dto.summary.trim() }),
      ...(dto.cefrLevel === undefined ? {} : { cefrLevel: dto.cefrLevel }),
      ...(dto.sourceName === undefined
        ? {}
        : { sourceName: dto.sourceName.trim() }),
      ...(dto.sourceUrl === undefined
        ? {}
        : { sourceUrl: dto.sourceUrl.trim() }),
      ...(dto.authorName === undefined
        ? {}
        : { authorName: dto.authorName.trim() }),
      ...(dto.thumbnailUrl === undefined
        ? {}
        : { thumbnailUrl: dto.thumbnailUrl.trim() }),
      updatedByUserId: actingAdminId,
    };
  }

  private mapWriteError(error: unknown): never {
    if (hasPrismaCode(error, 'P2002')) {
      throw new ConflictException('Article slug already exists');
    }
    if (hasPrismaCode(error, 'P2025')) {
      throw new NotFoundException('Article not found');
    }
    if (hasPrismaCode(error, 'P2003')) {
      throw new NotFoundException('Active category not found');
    }
    throw error;
  }
}
