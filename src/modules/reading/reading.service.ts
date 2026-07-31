import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiGenerationStatus,
  ReadingStatus,
} from '../../../generated/prisma/enums';
import { isCefrAtOrAbove } from '../../common/utils/cefr-level.util';
import type { TermEnrichmentResult } from '../ai/ai.contracts';
import { AiService } from '../ai/ai.service';
import { ArticleContentService } from '../articles/services/article-content.service';
import type {
  ReadingHistoryQueryDto,
  UpdateReadingProgressDto,
} from './dto/reading-response.dto';
import {
  type ContextualTermLookupRecord,
  type ContextualTermEnrichmentClaimRecord,
  ContextualTermEnrichmentStateConflictError,
  type ReadingHistoryRecord,
  ReadingProgressMutationConflictError,
  type ReaderProgressRecord,
  type SavableContextualTermRecord,
  ReadingRepository,
} from './reading.repository';

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class ReadingService {
  constructor(
    private readonly readingRepository: ReadingRepository,
    private readonly articleContentService: ArticleContentService,
    private readonly aiService: AiService,
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
    const cached = await this.readingRepository.findContextualTerm(
      userId,
      articleId,
      termId,
    );
    this.requireLookupAccessible(cached);

    if (cached.term.explanationStatus === AiGenerationStatus.READY) {
      return this.mapContextualTerm(cached);
    }
    if (cached.term.explanationStatus === AiGenerationStatus.PROCESSING) {
      this.throwEnrichmentUnavailable();
    }

    const claim = await this.readingRepository.claimContextualTermEnrichment(
      articleId,
      termId,
    );
    if (!claim) {
      const refreshed = await this.readingRepository.findContextualTerm(
        userId,
        articleId,
        termId,
      );
      this.requireLookupAccessible(refreshed);
      if (refreshed.term.explanationStatus === AiGenerationStatus.READY) {
        return this.mapContextualTerm(refreshed);
      }
      this.throwEnrichmentUnavailable();
    }

    let enrichment: TermEnrichmentResult;
    try {
      enrichment = await this.aiService.enrichContextualTerm({
        articleId: claim.article.id,
        articleTitle: claim.article.title,
        termId: claim.term.id,
        value: claim.term.value,
        wordDisplay: claim.term.wordDisplay,
        lemma: claim.term.lemma,
        normalizedLemma: claim.term.normalizedLemma,
        unitType: claim.term.unitType,
        partOfSpeech: claim.term.partOfSpeech,
        cefrLevel: claim.term.cefrLevel,
        parentSentenceText: claim.parentSentence.sentenceText,
        surroundingSentenceContext: this.buildSurroundingContext(claim),
      });
    } catch {
      await this.readingRepository.failContextualTermEnrichment(
        claim.article.id,
        claim.article.contentVersion,
        claim.term.id,
        this.sanitizeEnrichmentError(
          'AI contextual-term enrichment failed safely',
        ),
      );
      throw new ServiceUnavailableException(
        'Contextual term enrichment is temporarily unavailable; retry later',
      );
    }

    try {
      await this.readingRepository.completeContextualTermEnrichment({
        articleId: claim.article.id,
        contentVersion: claim.article.contentVersion,
        termId: claim.term.id,
        parentSentenceId: claim.parentSentence.id,
        generatedAt: new Date(),
        enrichment,
      });
    } catch (error: unknown) {
      await this.readingRepository.failContextualTermEnrichment(
        claim.article.id,
        claim.article.contentVersion,
        claim.term.id,
        this.sanitizeEnrichmentError(
          'Contextual term source changed during enrichment',
        ),
      );
      if (error instanceof ContextualTermEnrichmentStateConflictError) {
        throw new ConflictException(
          'Article or contextual term changed during enrichment; retry the lookup',
        );
      }
      throw error;
    }

    const enriched = await this.readingRepository.findContextualTerm(
      userId,
      articleId,
      termId,
    );
    this.requireLookupAccessible(enriched);
    if (enriched.term.explanationStatus !== AiGenerationStatus.READY) {
      throw new ConflictException(
        'Contextual term enrichment did not reach a ready state; retry the lookup',
      );
    }
    return this.mapContextualTerm(enriched);
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
    if (result.term.explanationStatus !== AiGenerationStatus.READY) {
      throw new UnprocessableEntityException(
        'Contextual term is not ready to be saved',
      );
    }
    this.requireSavableText(result.term.wordDisplay);
    this.requireSavableText(result.term.lemma);
    this.requireSavableText(result.term.partOfSpeech);
    this.requireSavableText(result.term.contextualMeaningVi);
    this.requireSavableText(result.parentSentence.sentenceText);
    this.requireSavableText(result.parentSentence.translationVi);
    if (!this.hasCanonicalExamples(result.term.examples)) {
      throw new UnprocessableEntityException(
        'Contextual term is not ready to be saved',
      );
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

  private mapContextualTerm(result: ContextualTermLookupRecord) {
    return {
      term: result.term,
      parentSentence: result.parentSentence,
      saveState: this.mapSaveState(result),
    };
  }

  private requireLookupAccessible(
    result: ContextualTermLookupRecord | null,
  ): asserts result is ContextualTermLookupRecord {
    if (!result) {
      throw new NotFoundException('Published contextual term not found');
    }
    if (!result.isLookupEnabled) {
      throw new ForbiddenException('Contextual term lookup is disabled');
    }
  }

  private throwEnrichmentUnavailable(): never {
    throw new ServiceUnavailableException(
      'Contextual term enrichment is already processing; retry later',
    );
  }

  private buildSurroundingContext(
    claim: ContextualTermEnrichmentClaimRecord,
  ): string {
    const context = claim.neighboringSentences
      .filter(({ id }) => id !== claim.parentSentence.id)
      .map(
        ({ sentenceOrder, sentenceText }) =>
          `[${sentenceOrder}] ${sentenceText.slice(0, 1000)}`,
      )
      .join('\n')
      .slice(0, 4000)
      .trim();

    return context || claim.parentSentence.sentenceText.slice(0, 4000).trim();
  }

  private sanitizeEnrichmentError(message: string): string {
    return message
      .replace(/\s+/gu, ' ')
      .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '')
      .trim()
      .slice(0, 500);
  }

  private requireSavableText(value: string | null): void {
    if (!value?.trim()) {
      throw new UnprocessableEntityException(
        'Contextual term is not ready to be saved',
      );
    }
  }

  private hasCanonicalExamples(value: unknown): boolean {
    if (!Array.isArray(value) || value.length > 2) return false;
    const examples: unknown[] = value;

    return examples.every(
      (example) =>
        isUnknownRecord(example) &&
        Object.keys(example).length === 2 &&
        typeof example.sentence === 'string' &&
        example.sentence.trim().length > 0 &&
        typeof example.translationVi === 'string' &&
        example.translationVi.trim().length > 0,
    );
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
