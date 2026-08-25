import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
} from '../../../../../generated/prisma/enums';
import { CategoriesService } from '../../../../../src/modules/categories/categories.service';
import { ArticleSort } from '../../../../../src/modules/articles/dto/get-articles-query.dto';
import { ArticlesRepository } from '../../../../../src/modules/articles/repositories/articles.repository';
import { ArticleContentService } from '../../../../../src/modules/articles/services/article-content.service';
import { ArticlesService } from '../../../../../src/modules/articles/services/articles.service';

interface ArticlesRepositoryMock {
  findPublished: jest.Mock;
  findPublishedBySlug: jest.Mock;
  findAdminArticles: jest.Mock;
  findAdminArticleDetail: jest.Mock;
  create: jest.Mock;
  findImportedDuplicate: jest.Mock;
  createImported: jest.Mock;
  findMutationState: jest.Mock;
  update: jest.Mock;
  updateContent: jest.Mock;
  findDeleteSafety: jest.Mock;
  delete: jest.Mock;
}

describe('ArticlesService', () => {
  let service: ArticlesService;
  let repository: ArticlesRepositoryMock;
  let contentService: { sanitize: jest.Mock };
  let categoriesService: { requireActiveCategory: jest.Mock };

  beforeEach(async () => {
    repository = {
      findPublished: jest.fn(),
      findPublishedBySlug: jest.fn(),
      findAdminArticles: jest.fn(),
      findAdminArticleDetail: jest.fn(),
      create: jest.fn(),
      findImportedDuplicate: jest.fn(),
      createImported: jest.fn(),
      findMutationState: jest.fn(),
      update: jest.fn(),
      updateContent: jest.fn(),
      findDeleteSafety: jest.fn(),
      delete: jest.fn(),
    };
    contentService = { sanitize: jest.fn((html: string) => html.trim()) };
    categoriesService = {
      requireActiveCategory: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: ArticlesRepository, useValue: repository },
        { provide: ArticleContentService, useValue: contentService },
        { provide: CategoriesService, useValue: categoriesService },
      ],
    }).compile();

    service = module.get(ArticlesService);
  });

  it('normalizes filters and maps consistent pagination metadata', async () => {
    repository.findPublished.mockResolvedValue({ items: [], total: 41 });

    await expect(
      service.findAll({
        page: 2,
        limit: 20,
        q: '  learning  ',
        categorySlug: '  TECHNOLOGY  ',
        cefrLevel: 'B1',
        sort: ArticleSort.OLDEST,
      }),
    ).resolves.toEqual({
      items: [],
      meta: { page: 2, limit: 20, total: 41, totalPages: 3 },
    });
    expect(repository.findPublished).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      q: 'learning',
      categorySlug: 'technology',
      cefrLevel: 'B1',
      sort: ArticleSort.OLDEST,
    });
  });

  it('omits blank optional values when called outside the DTO boundary', async () => {
    repository.findPublished.mockResolvedValue({ items: [], total: 0 });

    await service.findAll({
      page: 1,
      limit: 20,
      q: '   ',
      sort: ArticleSort.NEWEST,
    });

    expect(repository.findPublished).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      sort: ArticleSort.NEWEST,
    });
  });

  it('returns published metadata without reader content', async () => {
    const detail = {
      article: {
        id: 'article-id',
        title: 'How Technology Changes Learning',
        slug: 'how-technology-changes-learning',
        summary: 'Summary',
        sourceName: null,
        sourceUrl: null,
        authorName: null,
        thumbnailUrl: null,
        cefrLevel: 'B1' as const,
        status: 'PUBLISHED' as const,
        publishedAt: new Date('2026-07-22T10:00:00Z'),
      },
      category: {
        id: 'category-id',
        name: 'Technology',
        slug: 'technology',
      },
      quizCount: 2,
    };
    repository.findPublishedBySlug.mockResolvedValue(detail);

    await expect(
      service.findOneBySlug('  HOW-TECHNOLOGY-CHANGES-LEARNING  '),
    ).resolves.toEqual(detail);
    expect(repository.findPublishedBySlug).toHaveBeenCalledWith(
      'how-technology-changes-learning',
    );
    expect(JSON.stringify(detail)).not.toContain('contentHtml');
  });

  it.each(['unknown', 'draft', 'archived'])(
    'returns the same not-found error for an %s slug',
    async (slug) => {
      repository.findPublishedBySlug.mockResolvedValue(null);

      await expect(service.findOneBySlug(slug)).rejects.toThrow(
        new NotFoundException('Article not found'),
      );
    },
  );

  it('normalizes admin filters and defaults to newest stable repository sort', async () => {
    repository.findAdminArticles.mockResolvedValue({ items: [], total: 1 });

    await expect(
      service.findAllAdmin({
        page: 1,
        limit: 20,
        q: '  learning  ',
        categoryId: 'category-id',
        cefrLevel: 'B2',
        status: ArticleStatus.DRAFT,
      }),
    ).resolves.toEqual({
      items: [],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(repository.findAdminArticles).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: 'learning',
      categoryId: 'category-id',
      cefrLevel: 'B2',
      status: ArticleStatus.DRAFT,
      sort: 'newest',
    });
  });

  it('creates only a version-one DRAFT through trusted repository input', async () => {
    repository.create.mockResolvedValue({ id: 'article-id' });
    contentService.sanitize.mockReturnValue('<p>Safe</p>');

    await service.create('admin-id', {
      categoryId: 'category-id',
      title: '  Article  ',
      slug: '  ARTICLE  ',
      summary: '  Summary  ',
      contentHtml: '<p onclick="bad()">Safe</p>',
      cefrLevel: 'B1',
    });

    expect(categoriesService.requireActiveCategory).toHaveBeenCalledWith(
      'category-id',
    );
    expect(repository.create).toHaveBeenCalledWith({
      categoryId: 'category-id',
      title: 'Article',
      slug: 'article',
      summary: 'Summary',
      contentHtml: '<p>Safe</p>',
      cefrLevel: 'B1',
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });
  });

  it('creates imported drafts with fixed pre-analysis state and sanitized content', async () => {
    repository.createImported.mockResolvedValue({ id: 'imported-id' });
    contentService.sanitize.mockReturnValue('<p>Sanitized import.</p>');

    await service.createImportedDraft('admin-id', {
      categoryId: 'category-id',
      title: 'Imported report',
      slug: 'imported-report-abc123',
      summary: 'Summary',
      contentHtml: '<p onclick="bad()">Sanitized import.</p>',
      importSource: 'guardian',
      externalId: 'external-id',
      canonicalUrl: 'https://example.com/story',
      contentHash: 'a'.repeat(64),
      sourcePublishedAt: new Date('2026-07-30T00:00:00Z'),
      sourceName: 'Example',
    });

    expect(repository.createImported).toHaveBeenCalledWith({
      categoryId: 'category-id',
      title: 'Imported report',
      slug: 'imported-report-abc123',
      summary: 'Summary',
      contentHtml: '<p>Sanitized import.</p>',
      importSource: 'guardian',
      externalId: 'external-id',
      canonicalUrl: 'https://example.com/story',
      contentHash: 'a'.repeat(64),
      sourcePublishedAt: new Date('2026-07-30T00:00:00Z'),
      sourceName: 'Example',
      cefrLevel: CefrLevel.B1,
      aiAnalysisStatus: AiGenerationStatus.PENDING,
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });
  });

  it('maps an imported uniqueness race to the provider-neutral duplicate error', async () => {
    repository.createImported.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(
      service.createImportedDraft('admin-id', {
        categoryId: 'category-id',
        title: 'Imported report',
        slug: 'imported-report-abc123',
        summary: 'Summary',
        contentHtml: '<p>Imported.</p>',
        importSource: 'guardian',
        externalId: 'external-id',
        canonicalUrl: 'https://example.com/story',
        contentHash: 'a'.repeat(64),
        sourcePublishedAt: new Date('2026-07-30T00:00:00Z'),
      }),
    ).rejects.toMatchObject({
      name: 'Error',
      message: 'Imported article already exists',
    });
  });

  it('rejects missing or inactive categories before create', async () => {
    categoriesService.requireActiveCategory.mockRejectedValue(
      new NotFoundException('Active category not found'),
    );

    await expect(
      service.create('admin-id', {
        categoryId: 'missing',
        title: 'Article',
        slug: 'article',
        summary: 'Summary',
        contentHtml: '<p>Safe</p>',
        cefrLevel: 'B1',
      }),
    ).rejects.toThrow(new NotFoundException('Active category not found'));
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate slug race to conflict', async () => {
    repository.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(
      service.create('admin-id', {
        categoryId: 'category-id',
        title: 'Article',
        slug: 'article',
        summary: 'Summary',
        contentHtml: '<p>Safe</p>',
        cefrLevel: 'B1',
      }),
    ).rejects.toThrow(new ConflictException('Article slug already exists'));
  });

  it('increments content exactly once through the transactional content path', async () => {
    repository.findMutationState.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.DRAFT,
      contentHtml: '<p>Old</p>',
      contentVersion: 3,
    });
    contentService.sanitize.mockReturnValue('<p>New</p>');
    repository.updateContent.mockResolvedValue({ id: 'article-id' });

    await expect(
      service.update('admin-id', 'article-id', {
        contentHtml: '<p>New</p>',
      }),
    ).resolves.toEqual({
      article: { id: 'article-id' },
      contentChanged: true,
    });
    expect(repository.updateContent).toHaveBeenCalledWith(
      'article-id',
      3,
      {
        contentHtml: '<p>New</p>',
        updatedByUserId: 'admin-id',
      },
      true,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('does not increment contentVersion for metadata-only or unchanged content', async () => {
    repository.findMutationState.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.PUBLISHED,
      contentHtml: '<p>Same</p>',
      contentVersion: 4,
    });
    contentService.sanitize.mockReturnValue('<p>Same</p>');
    repository.update.mockResolvedValue({ id: 'article-id', title: 'Updated' });

    await expect(
      service.update('admin-id', 'article-id', {
        title: ' Updated ',
        contentHtml: '<p>Same</p>',
      }),
    ).resolves.toMatchObject({ contentChanged: false });
    expect(repository.update).toHaveBeenCalledWith('article-id', {
      title: 'Updated',
      updatedByUserId: 'admin-id',
    });
    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('requires an active replacement category before an article update', async () => {
    repository.findMutationState.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.DRAFT,
      contentHtml: '<p>Same</p>',
      contentVersion: 1,
    });
    repository.update.mockResolvedValue({ id: 'article-id' });

    await service.update('admin-id', 'article-id', {
      categoryId: 'replacement-category-id',
    });

    expect(categoriesService.requireActiveCategory).toHaveBeenCalledWith(
      'replacement-category-id',
    );
    expect(repository.update).toHaveBeenCalledWith('article-id', {
      categoryId: 'replacement-category-id',
      updatedByUserId: 'admin-id',
    });
  });

  it('rejects empty PATCH and archived mutation', async () => {
    await expect(service.update('admin-id', 'article-id', {})).rejects.toThrow(
      BadRequestException,
    );

    repository.findMutationState.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.ARCHIVED,
      contentHtml: '<p>Old</p>',
      contentVersion: 1,
    });
    await expect(
      service.update('admin-id', 'article-id', { title: 'Nope' }),
    ).rejects.toThrow(
      new ConflictException('Archived articles cannot be updated'),
    );
  });

  it('hard deletes only a DRAFT with no learning references', async () => {
    repository.findDeleteSafety.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.DRAFT,
      readingProgressCount: 0,
      savedVocabularyCount: 0,
      quizCount: 0,
      reviewSessionCount: 0,
      reviewAnswerCount: 0,
    });

    await expect(
      service.delete('admin-id', 'article-id'),
    ).resolves.toBeUndefined();
    expect(repository.delete).toHaveBeenCalledWith('article-id');
  });

  it('maps a delete FK race to conflict instead of cascading learning data', async () => {
    repository.findDeleteSafety.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.DRAFT,
      readingProgressCount: 0,
      savedVocabularyCount: 0,
      quizCount: 0,
      reviewSessionCount: 0,
      reviewAnswerCount: 0,
    });
    repository.delete.mockRejectedValue(
      Object.assign(new Error('foreign key'), { code: 'P2003' }),
    );

    await expect(service.delete('admin-id', 'article-id')).rejects.toThrow(
      new ConflictException(
        'Article has learning history or references; archive it instead',
      ),
    );
  });

  it.each([
    { status: ArticleStatus.PUBLISHED },
    { status: ArticleStatus.DRAFT, readingProgressCount: 1 },
    { status: ArticleStatus.DRAFT, savedVocabularyCount: 1 },
    { status: ArticleStatus.DRAFT, quizCount: 1 },
    { status: ArticleStatus.DRAFT, reviewSessionCount: 1 },
    { status: ArticleStatus.DRAFT, reviewAnswerCount: 1 },
  ])('blocks unsafe deletion: $status', async (override) => {
    repository.findDeleteSafety.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.DRAFT,
      readingProgressCount: 0,
      savedVocabularyCount: 0,
      quizCount: 0,
      reviewSessionCount: 0,
      reviewAnswerCount: 0,
      ...override,
    });

    await expect(service.delete('admin-id', 'article-id')).rejects.toThrow(
      ConflictException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
