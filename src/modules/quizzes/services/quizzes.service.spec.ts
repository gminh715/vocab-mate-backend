import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ArticleStatus, QuizStatus } from '../../../../generated/prisma/enums';
import { QuizzesRepository } from '../repositories/quizzes.repository';
import { QuizzesService } from './quizzes.service';

interface RepositoryMock {
  findPublished: jest.Mock;
  findPublishedDetail: jest.Mock;
  aggregateActiveQuestions: jest.Mock;
  findAdmin: jest.Mock;
  findAdminDetail: jest.Mock;
  findArticleForCreation: jest.Mock;
  create: jest.Mock;
  findMutationState: jest.Mock;
  update: jest.Mock;
  findDeleteSafety: jest.Mock;
  deleteUnusedDraft: jest.Mock;
}

describe('QuizzesService', () => {
  let service: QuizzesService;
  let repository: RepositoryMock;

  beforeEach(async () => {
    repository = {
      findPublished: jest.fn(),
      findPublishedDetail: jest.fn(),
      aggregateActiveQuestions: jest.fn(),
      findAdmin: jest.fn(),
      findAdminDetail: jest.fn(),
      findArticleForCreation: jest.fn(),
      create: jest.fn(),
      findMutationState: jest.fn(),
      update: jest.fn(),
      findDeleteSafety: jest.fn(),
      deleteUnusedDraft: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizzesService,
        { provide: QuizzesRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(QuizzesService);
  });

  it('normalizes public filters and maps pagination metadata', async () => {
    repository.findPublished.mockResolvedValue({ items: [], total: 21 });

    await expect(
      service.findAll({
        page: 2,
        limit: 10,
        articleId: 'article-id',
        q: '  technology  ',
      }),
    ).resolves.toEqual({
      items: [],
      meta: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    expect(repository.findPublished).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      articleId: 'article-id',
      q: 'technology',
    });
  });

  it('returns only safe detail plus active question aggregates', async () => {
    const detail = {
      quiz: {
        id: 'quiz-id',
        articleId: 'article-id',
        title: 'Quiz',
        description: null,
        status: QuizStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      article: {
        id: 'article-id',
        title: 'Article',
        slug: 'article',
        summary: 'Summary',
        sourceName: null,
        sourceUrl: null,
        authorName: null,
        thumbnailUrl: null,
        cefrLevel: 'B1',
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    };
    repository.findPublishedDetail.mockResolvedValue(detail);
    repository.aggregateActiveQuestions.mockResolvedValue({
      questionCount: 2,
      totalPoints: 5,
    });

    const result = await service.findOne('quiz-id');

    expect(result).toMatchObject({ questionCount: 2, totalPoints: 5 });
    expect(JSON.stringify(result)).not.toContain('correctAnswer');
    expect(JSON.stringify(result)).not.toContain('options');
    expect(repository.aggregateActiveQuestions).toHaveBeenCalledWith('quiz-id');
  });

  it.each(['missing', 'draft', 'archived', 'inaccessible article'])(
    'returns the same not-found response for %s public detail',
    async () => {
      repository.findPublishedDetail.mockResolvedValue(null);

      await expect(service.findOne('quiz-id')).rejects.toThrow(
        new NotFoundException('Quiz not found'),
      );
      expect(repository.aggregateActiveQuestions).not.toHaveBeenCalled();
    },
  );

  it('passes all admin filters and pagination to the repository', async () => {
    repository.findAdmin.mockResolvedValue({ items: [], total: 1 });

    await service.findAllAdmin({
      page: 1,
      limit: 20,
      q: '  Quiz  ',
      articleId: 'article-id',
      status: QuizStatus.DRAFT,
    });

    expect(repository.findAdmin).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: 'Quiz',
      articleId: 'article-id',
      status: QuizStatus.DRAFT,
    });
  });

  it.each([ArticleStatus.DRAFT, ArticleStatus.PUBLISHED])(
    'creates a DRAFT quiz for a %s article using JWT audit identity',
    async (status) => {
      repository.findArticleForCreation.mockResolvedValue({
        id: 'article-id',
        status,
      });
      repository.create.mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve({
          id: 'quiz-id',
          articleId: input.articleId,
          title: input.title,
          description: input.description ?? null,
          status: QuizStatus.DRAFT,
          publishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      await service.create('admin-from-jwt', {
        articleId: 'article-id',
        title: '  Quiz title  ',
        description: '  Description  ',
      });

      expect(repository.create).toHaveBeenCalledWith({
        articleId: 'article-id',
        title: 'Quiz title',
        description: 'Description',
        createdByUserId: 'admin-from-jwt',
        updatedByUserId: 'admin-from-jwt',
      });
    },
  );

  it('rejects missing and archived articles on create', async () => {
    repository.findArticleForCreation.mockResolvedValueOnce(null);
    await expect(
      service.create('admin-id', {
        articleId: 'missing',
        title: 'Quiz',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    repository.findArticleForCreation.mockResolvedValueOnce({
      id: 'article-id',
      status: ArticleStatus.ARCHIVED,
    });
    await expect(
      service.create('admin-id', {
        articleId: 'article-id',
        title: 'Quiz',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('performs a real partial update and records only the updater ID', async () => {
    repository.findMutationState.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.PUBLISHED,
    });
    repository.update.mockResolvedValue({ id: 'quiz-id' });

    await service.update('admin-from-jwt', 'quiz-id', {
      title: '  Updated  ',
    });

    expect(repository.update).toHaveBeenCalledWith('quiz-id', {
      title: 'Updated',
      updatedByUserId: 'admin-from-jwt',
    });
  });

  it('rejects empty and archived updates', async () => {
    await expect(
      service.update('admin-id', 'quiz-id', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findMutationState).not.toHaveBeenCalled();

    repository.findMutationState.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.ARCHIVED,
    });
    await expect(
      service.update('admin-id', 'quiz-id', { title: 'Updated' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('deletes only an unused draft quiz', async () => {
    repository.findDeleteSafety.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.DRAFT,
      reviewSessionCount: 0,
    });
    repository.deleteUnusedDraft.mockResolvedValue(true);

    await expect(
      service.delete('admin-from-jwt', 'quiz-id'),
    ).resolves.toBeUndefined();
    expect(repository.deleteUnusedDraft).toHaveBeenCalledWith('quiz-id');
  });

  it.each([
    [QuizStatus.PUBLISHED, 0],
    [QuizStatus.ARCHIVED, 0],
    [QuizStatus.DRAFT, 1],
  ])(
    'blocks deletion for status %s with %s review sessions',
    async (status, reviewSessionCount) => {
      repository.findDeleteSafety.mockResolvedValue({
        id: 'quiz-id',
        status,
        reviewSessionCount,
      });

      await expect(
        service.delete('admin-id', 'quiz-id'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.deleteUnusedDraft).not.toHaveBeenCalled();
    },
  );

  it('maps delete-time FK restrictions to conflict', async () => {
    repository.findDeleteSafety.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.DRAFT,
      reviewSessionCount: 0,
    });
    repository.deleteUnusedDraft.mockRejectedValue({ code: 'P2003' });

    await expect(service.delete('admin-id', 'quiz-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
