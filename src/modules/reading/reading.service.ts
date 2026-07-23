import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReadingStatus } from '../../../generated/prisma/enums';
import { isCefrAtOrAbove } from '../../common/utils/cefr-level.util';
import { ArticleContentService } from '../articles/services/article-content.service';
import type {
  ReadingHistoryQueryDto,
  UpdateReadingProgressDto,
} from './dto/reading-response.dto';
import {
  type ContextualTermLookupRecord,
  type ReadingHistoryRecord,
  ReadingProgressMutationConflictError,
  type ReaderProgressRecord,
  type SavableContextualTermRecord,
  ReadingRepository,
} from './reading.repository';

@Injectable()
export class ReadingService {
  constructor(
    private readonly readingRepository: ReadingRepository,
    private readonly articleContentService: ArticleContentService,
  ) {}

  async getReaderArticle(userId: string, slug: string) {
    const result = await this.readingRepository.findReaderArticle(userId, slug);
    if (!result) {
      throw new NotFoundException('Published article not found');
    }
    if (!result.userCefrLevel) {
      throw new NotFoundException('User profile not found');
    }
    const userCefrLevel = result.userCefrLevel;

    return {
      article: result.article,
      contentHtml: this.articleContentService.sanitize(result.contentHtml),
      highlightedTermIds: result.termCandidates
        .filter(({ cefrLevel }) => isCefrAtOrAbove(cefrLevel, userCefrLevel))
        .map(({ id }) => id),
      progress: this.mapProgress(result.article.id, result.progress),
    };
  }

  async getContextualTerm(userId: string, articleId: string, termId: string) {
    const result = await this.readingRepository.findContextualTerm(
      userId,
      articleId,
      termId,
    );
    if (!result) {
      throw new NotFoundException('Published contextual term not found');
    }
    if (!result.isLookupEnabled) {
      throw new ForbiddenException('Contextual term lookup is disabled');
    }

    return {
      term: result.term,
      parentSentence: result.parentSentence,
      saveState: this.mapSaveState(result),
    };
  }

  async getContextualTermForSave(
    termId: string,
  ): Promise<SavableContextualTermRecord> {
    const result =
      await this.readingRepository.findContextualTermForSave(termId);
    if (
      !result ||
      result.parentSentence.contentVersion !==
        result.sourceArticle.contentVersion
    ) {
      throw new NotFoundException('Published contextual term not found');
    }
    if (!result.isLookupEnabled) {
      throw new ForbiddenException('Contextual term lookup is disabled');
    }

    return result;
  }

  async getHistory(userId: string, query: ReadingHistoryQueryDto) {
    const result = await this.readingRepository.listUserHistory(userId, {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      ...(query.status ? { status: query.status } : {}),
    });

    return {
      items: result.items.map((item) => this.mapHistoryItem(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async getProgress(userId: string, articleId: string) {
    const result = await this.readingRepository.findUserArticleProgress(
      userId,
      articleId,
    );
    if (!result) {
      throw new NotFoundException('Published article not found');
    }

    return {
      progress: this.mapProgress(result.articleId, result.progress),
    };
  }

  async updateProgress(
    userId: string,
    articleId: string,
    dto: UpdateReadingProgressDto,
  ) {
    if (dto.progressPercent === undefined && dto.lastBlockKey === undefined) {
      throw new BadRequestException('At least one progress field is required');
    }

    try {
      const result = await this.readingRepository.upsertUserArticleProgress(
        userId,
        articleId,
        {
          ...(dto.progressPercent === undefined
            ? {}
            : { progressPercent: dto.progressPercent }),
          ...(dto.lastBlockKey === undefined
            ? {}
            : { lastBlockKey: dto.lastBlockKey }),
        },
      );
      if (!result || !result.progress) {
        throw new NotFoundException('Published article not found');
      }

      return {
        progress: this.mapProgress(result.articleId, result.progress),
      };
    } catch (error: unknown) {
      this.mapProgressMutationError(error);
    }
  }

  async completeProgress(userId: string, articleId: string) {
    try {
      const result = await this.readingRepository.completeUserArticleProgress(
        userId,
        articleId,
      );
      if (!result || !result.progress) {
        throw new NotFoundException('Published article not found');
      }

      return {
        progress: this.mapProgress(result.articleId, result.progress),
      };
    } catch (error: unknown) {
      this.mapProgressMutationError(error);
    }
  }

  async deleteProgress(userId: string, articleId: string): Promise<void> {
    const deleted = await this.readingRepository.deleteUserArticleProgress(
      userId,
      articleId,
    );
    if (!deleted) {
      throw new NotFoundException('Reading progress not found');
    }
  }

  private mapProgress(
    articleId: string,
    progress: ReaderProgressRecord | null,
  ) {
    return progress
      ? {
          articleId: progress.articleId,
          status: progress.status,
          progressPercent: progress.progressPercent?.toNumber() ?? 0,
          lastBlockKey: progress.lastBlockKey,
          completedAt: progress.completedAt,
        }
      : {
          articleId,
          status: ReadingStatus.READING,
          progressPercent: 0,
          lastBlockKey: null,
          completedAt: null,
        };
  }

  private mapSaveState(result: ContextualTermLookupRecord) {
    return result.save
      ? {
          isSaved: true,
          userVocabularyId: result.save.id,
          learningStatus: result.save.learningStatus,
        }
      : {
          isSaved: false,
          userVocabularyId: null,
          learningStatus: null,
        };
  }

  private mapHistoryItem(item: ReadingHistoryRecord) {
    return {
      ...this.mapProgress(item.articleId, item),
      firstOpenedAt: item.firstOpenedAt,
      lastReadAt: item.lastReadAt,
      article: item.article,
    };
  }

  private mapProgressMutationError(error: unknown): never {
    if (error instanceof ReadingProgressMutationConflictError) {
      throw new ConflictException(
        'Reading progress changed concurrently; retry the request',
      );
    }
    throw error;
  }
}
