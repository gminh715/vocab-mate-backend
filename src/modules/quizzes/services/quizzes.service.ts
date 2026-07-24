import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ArticleStatus, QuizStatus } from '../../../../generated/prisma/enums';
import type {
  CreateQuizDto,
  GetAdminQuizzesQueryDto,
  GetQuizzesQueryDto,
  UpdateQuizDto,
} from '../dto/quiz-request.dto';
import {
  type AdminQuizDetailRecord,
  type AdminQuizListRecord,
  type AdminQuizRecord,
  type QuizRecord,
  QuizzesRepository,
} from '../repositories/quizzes.repository';

const hasPrismaCode = (error: unknown, code: 'P2003' | 'P2025'): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PublicQuizListResponse {
  items: QuizRecord[];
  meta: PaginationMeta;
}

export interface AdminQuizListResponse {
  items: AdminQuizListRecord[];
  meta: PaginationMeta;
}

@Injectable()
export class QuizzesService {
  constructor(private readonly quizzesRepository: QuizzesRepository) {}

  async findAll(query: GetQuizzesQueryDto): Promise<PublicQuizListResponse> {
    const q = query.q?.trim();
    const result = await this.quizzesRepository.findPublished({
      page: query.page,
      limit: query.limit,
      ...(query.articleId ? { articleId: query.articleId } : {}),
      ...(q ? { q } : {}),
    });

    return { items: result.items, meta: this.toMeta(query, result.total) };
  }

  async findOne(quizId: string) {
    const detail = await this.quizzesRepository.findPublishedDetail(quizId);
    if (!detail) {
      throw new NotFoundException('Quiz not found');
    }
    const aggregate =
      await this.quizzesRepository.aggregateActiveQuestions(quizId);

    return { ...detail, ...aggregate };
  }

  async findAllAdmin(
    query: GetAdminQuizzesQueryDto,
  ): Promise<AdminQuizListResponse> {
    const q = query.q?.trim();
    const result = await this.quizzesRepository.findAdmin({
      page: query.page,
      limit: query.limit,
      ...(query.articleId ? { articleId: query.articleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { q } : {}),
    });

    return { items: result.items, meta: this.toMeta(query, result.total) };
  }

  async findOneAdmin(quizId: string): Promise<AdminQuizDetailRecord> {
    const detail = await this.quizzesRepository.findAdminDetail(quizId);
    if (!detail) {
      throw new NotFoundException('Quiz not found');
    }

    return detail;
  }

  async create(
    actingAdminId: string,
    dto: CreateQuizDto,
  ): Promise<{ quiz: AdminQuizRecord }> {
    const article = await this.quizzesRepository.findArticleForCreation(
      dto.articleId,
    );
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    if (article.status === ArticleStatus.ARCHIVED) {
      throw new ConflictException('Archived articles cannot have new quizzes');
    }

    try {
      const quiz = await this.quizzesRepository.create({
        articleId: dto.articleId,
        title: dto.title.trim(),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description.trim() }),
        createdByUserId: actingAdminId,
        updatedByUserId: actingAdminId,
      });
      return { quiz };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async update(
    actingAdminId: string,
    quizId: string,
    dto: UpdateQuizDto,
  ): Promise<{ quiz: AdminQuizRecord }> {
    if (dto.title === undefined && dto.description === undefined) {
      throw new BadRequestException('At least one quiz field is required');
    }
    const state = await this.quizzesRepository.findMutationState(quizId);
    if (!state) {
      throw new NotFoundException('Quiz not found');
    }
    if (state.status === QuizStatus.ARCHIVED) {
      throw new ConflictException('Archived quizzes cannot be updated');
    }

    try {
      const quiz = await this.quizzesRepository.update(quizId, {
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description.trim() }),
        updatedByUserId: actingAdminId,
      });
      return { quiz };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async delete(actingAdminId: string, quizId: string): Promise<void> {
    void actingAdminId;
    const safety = await this.quizzesRepository.findDeleteSafety(quizId);
    if (!safety) {
      throw new NotFoundException('Quiz not found');
    }
    if (safety.status !== QuizStatus.DRAFT || safety.reviewSessionCount > 0) {
      throw new ConflictException('Only unused draft quizzes can be deleted');
    }

    try {
      const deleted = await this.quizzesRepository.deleteUnusedDraft(quizId);
      if (!deleted) {
        throw new ConflictException('Only unused draft quizzes can be deleted');
      }
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2003')) {
        throw new ConflictException(
          'Quiz has review history and cannot be deleted',
        );
      }
      throw error;
    }
  }

  private toMeta(
    query: { page: number; limit: number },
    total: number,
  ): PaginationMeta {
    return {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  private mapWriteError(error: unknown): never {
    if (hasPrismaCode(error, 'P2003')) {
      throw new ConflictException('Referenced resource is not available');
    }
    if (hasPrismaCode(error, 'P2025')) {
      throw new NotFoundException('Quiz not found');
    }
    throw error;
  }
}
