import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
  LexicalUnitType,
} from '../../../../generated/prisma/enums';
import type { AiConfig } from '../../../config/ai.config';
import { AI_CONFIG } from '../../../config/config.module';
import type {
  ArticleAnalysisResult,
  ArticleAnalysisTerm,
} from '../../ai/ai.contracts';
import { AiService } from '../../ai/ai.service';
import { AI_OUTPUT_LIMITS } from '../../ai/ai.validation';
import { CategoriesRepository } from '../../categories/categories.repository';
import { TermMarkerHelper } from '../helpers/term-marker.helper';
import {
  ArticleAnalysisStateConflictError,
  type ArticleAnalysisCompletionRecord,
  type ArticleAnalysisSentenceRecord,
  type ArticleAnalysisSnapshot,
  ArticlesRepository,
  type PendingAiTermInput,
} from '../repositories/articles.repository';

const MAX_STORED_ANALYSIS_ERROR_LENGTH = 500;

class ArticleAnalysisOutputError extends Error {}

interface TextRange {
  start: number;
  end: number;
}

interface ValidatedCandidate extends PendingAiTermInput {
  ranges: TextRange[];
}

@Injectable()
export class ArticleAnalysisService {
  constructor(
    private readonly articlesRepository: ArticlesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly aiService: AiService,
    @Inject(AI_CONFIG) private readonly aiConfig: AiConfig,
  ) {}

  async analyze(
    actingAdminId: string,
    articleId: string,
  ): Promise<ArticleAnalysisCompletionRecord> {
    const snapshot =
      await this.articlesRepository.findAnalysisSnapshot(articleId);
    if (!snapshot) throw new NotFoundException('Article not found');
    this.requireEligibleSnapshot(snapshot);

    const categories = await this.categoriesRepository.findActive({});
    if (categories.length === 0) {
      throw new UnprocessableEntityException(
        'At least one active category is required for article analysis',
      );
    }

    const articleText = snapshot.sentences
      .map(({ sentenceText }) => sentenceText)
      .join(' ');
    if (articleText.length > this.aiConfig.maxArticleCharacters) {
      throw new UnprocessableEntityException(
        'Parsed article text exceeds the configured AI analysis limit',
      );
    }

    const claimed = await this.articlesRepository.claimArticleAnalysis(
      articleId,
      snapshot.article.contentVersion,
    );
    if (!claimed) {
      throw new ConflictException(
        'Article analysis is already processing or its state changed',
      );
    }

    let result: ArticleAnalysisResult;
    let candidates: PendingAiTermInput[];
    try {
      result = await this.aiService.analyzeArticle({
        articleId,
        title: snapshot.article.title,
        articleText,
        contentVersion: snapshot.article.contentVersion,
        sentences: snapshot.sentences.map(({ id, sentenceText }) => ({
          sentenceId: id,
          sentenceText,
        })),
        allowedCategories: categories,
        maxTermCount: this.aiConfig.maxTermsPerArticle,
      });
      this.validateResultMetadata(
        result,
        categories.map(({ slug }) => slug),
      );
      candidates = this.validateCandidates(
        result,
        snapshot.sentences,
        actingAdminId,
      );
    } catch (error: unknown) {
      const invalidOutput = error instanceof ArticleAnalysisOutputError;
      await this.failClaimedAnalysis(
        actingAdminId,
        snapshot,
        invalidOutput
          ? 'AI analysis output failed validation'
          : 'AI service is temporarily unavailable',
      );
      if (invalidOutput) {
        throw new UnprocessableEntityException(
          'AI analysis output failed validation',
        );
      }
      throw new ServiceUnavailableException(
        'AI service is temporarily unavailable',
      );
    }

    const category = categories.find(
      ({ slug }) => slug === result.categorySlug,
    );
    if (!category) {
      await this.failClaimedAnalysis(
        actingAdminId,
        snapshot,
        'AI analysis output failed validation',
      );
      throw new UnprocessableEntityException(
        'AI analysis output failed validation',
      );
    }

    try {
      return await this.articlesRepository.completeArticleAnalysis({
        articleId,
        contentVersion: snapshot.article.contentVersion,
        sourceContentHtml: snapshot.article.contentHtml,
        categoryId: category.id,
        summary: this.normalizeWhitespace(result.summaryEn),
        cefrLevel: result.cefrLevel,
        actingAdminId,
        expectedSentences: snapshot.sentences,
        terms: candidates,
      });
    } catch (error: unknown) {
      if (error instanceof ArticleAnalysisStateConflictError) {
        await this.articlesRepository.failArticleAnalysis(
          articleId,
          snapshot.article.contentVersion,
          this.sanitizeError('Article changed during AI analysis; retry'),
          actingAdminId,
        );
        throw new ConflictException(
          'Article changed during AI analysis; stale result was not applied',
        );
      }

      await this.articlesRepository.failArticleAnalysis(
        articleId,
        snapshot.article.contentVersion,
        this.sanitizeError('AI analysis could not be saved'),
        actingAdminId,
      );
      throw error;
    }
  }

  private validateResultMetadata(
    result: ArticleAnalysisResult,
    categorySlugs: string[],
  ): void {
    this.requiredNormalizedString(result.summaryEn, AI_OUTPUT_LIMITS.summary);
    if (
      !Object.values(CefrLevel).includes(result.cefrLevel) ||
      !categorySlugs.includes(result.categorySlug)
    ) {
      throw new ArticleAnalysisOutputError();
    }
  }

  private requireEligibleSnapshot(snapshot: ArticleAnalysisSnapshot): void {
    if (snapshot.article.status !== ArticleStatus.DRAFT) {
      throw new ConflictException('Only draft articles can be analyzed');
    }
    if (snapshot.sentences.length === 0) {
      throw new UnprocessableEntityException(
        'The current content version has no active parsed sentences',
      );
    }
    if (snapshot.article.aiAnalysisStatus === AiGenerationStatus.PROCESSING) {
      throw new ConflictException('Article analysis is already processing');
    }
    if (snapshot.article.aiAnalysisStatus === AiGenerationStatus.READY) {
      throw new ConflictException('Article analysis is already ready');
    }
    if (
      snapshot.article.aiAnalysisStatus !== AiGenerationStatus.PENDING &&
      snapshot.article.aiAnalysisStatus !== AiGenerationStatus.FAILED
    ) {
      throw new ConflictException('Article is not eligible for AI analysis');
    }
  }

  private validateCandidates(
    result: ArticleAnalysisResult,
    sentences: ArticleAnalysisSentenceRecord[],
    actingAdminId: string,
  ): PendingAiTermInput[] {
    if (
      !Array.isArray(result.terms) ||
      result.terms.length > this.aiConfig.maxTermsPerArticle
    ) {
      throw new ArticleAnalysisOutputError();
    }

    const sentenceMap = new Map(
      sentences.map((sentence) => [sentence.id, sentence]),
    );
    const candidatesBySentence = new Map<string, ValidatedCandidate[]>();

    for (const term of result.terms) {
      const sentence = sentenceMap.get(term.sentenceId);
      if (!sentence) throw new ArticleAnalysisOutputError();
      const candidate = this.validateCandidate(term, sentence, actingAdminId);
      const sentenceCandidates = candidatesBySentence.get(sentence.id) ?? [];

      const duplicateKey = this.duplicateKey(candidate.value);
      if (
        sentenceCandidates.some(
          (existing) => this.duplicateKey(existing.value) === duplicateKey,
        )
      ) {
        throw new ArticleAnalysisOutputError();
      }

      for (const existingTerm of sentence.terms) {
        if (this.duplicateKey(existingTerm.value) === duplicateKey) {
          throw new ArticleAnalysisOutputError();
        }
        const existingRanges = this.findRanges(
          sentence.sentenceText,
          existingTerm.value,
          false,
        );
        if (this.hasAnyOverlap(candidate.ranges, existingRanges)) {
          throw new ArticleAnalysisOutputError();
        }
      }
      if (
        sentenceCandidates.some((existing) =>
          this.hasAnyOverlap(candidate.ranges, existing.ranges),
        )
      ) {
        throw new ArticleAnalysisOutputError();
      }

      sentenceCandidates.push(candidate);
      candidatesBySentence.set(sentence.id, sentenceCandidates);
    }

    return [...candidatesBySentence.values()].flat().map((validated) => {
      const { ranges, ...candidate } = validated;
      void ranges;
      return candidate;
    });
  }

  private validateCandidate(
    term: ArticleAnalysisTerm,
    sentence: ArticleAnalysisSentenceRecord,
    actingAdminId: string,
  ): ValidatedCandidate {
    const value = this.requiredNormalizedString(
      term.value,
      AI_OUTPUT_LIMITS.termText,
    );
    const wordDisplay = this.requiredNormalizedString(
      term.wordDisplay,
      AI_OUTPUT_LIMITS.termText,
    );
    const lemma = this.requiredNormalizedString(
      term.lemma,
      AI_OUTPUT_LIMITS.termText,
    );
    const normalizedLemma = lemma.toLocaleLowerCase('en-US');
    const suppliedNormalizedLemma = this.requiredNormalizedString(
      term.normalizedLemma,
      AI_OUTPUT_LIMITS.termText,
    ).toLocaleLowerCase('en-US');
    const partOfSpeech = this.requiredNormalizedString(
      term.partOfSpeech,
      AI_OUTPUT_LIMITS.partOfSpeech,
    ).toLocaleLowerCase('en-US');
    const selectionReason = this.requiredNormalizedString(
      term.selectionReason,
      AI_OUTPUT_LIMITS.selectionReason,
    );

    if (
      suppliedNormalizedLemma !== normalizedLemma ||
      !Object.values(LexicalUnitType).includes(term.unitType) ||
      !Object.values(CefrLevel).includes(term.cefrLevel) ||
      !sentence.sentenceText.includes(value) ||
      !TermMarkerHelper.matchesText(sentence.sentenceText, value, term.unitType)
    ) {
      throw new ArticleAnalysisOutputError();
    }

    const ranges = this.findRanges(sentence.sentenceText, value, true);
    if (ranges.length === 0) throw new ArticleAnalysisOutputError();

    return {
      id: randomUUID(),
      sentenceId: sentence.id,
      value,
      wordDisplay,
      lemma,
      normalizedLemma,
      unitType: term.unitType,
      partOfSpeech,
      cefrLevel: term.cefrLevel,
      selectionReason,
      createdByUserId: actingAdminId,
      updatedByUserId: actingAdminId,
      ranges,
    };
  }

  private requiredNormalizedString(value: unknown, maximum: number): string {
    if (typeof value !== 'string') throw new ArticleAnalysisOutputError();
    const normalized = this.normalizeWhitespace(value);
    if (!normalized || normalized.length > maximum) {
      throw new ArticleAnalysisOutputError();
    }
    return normalized;
  }

  private normalizeWhitespace(value: string): string {
    return value.replace(/\s+/gu, ' ').trim();
  }

  private duplicateKey(value: string): string {
    return value.trim().toLocaleLowerCase('en-US');
  }

  private findRanges(
    text: string,
    value: string,
    caseSensitive: boolean,
  ): TextRange[] {
    const haystack = caseSensitive ? text : text.toLocaleLowerCase('en-US');
    const needle = caseSensitive ? value : value.toLocaleLowerCase('en-US');
    if (!needle) return [];

    const ranges: TextRange[] = [];
    let cursor = 0;
    while (cursor <= haystack.length - needle.length) {
      const start = haystack.indexOf(needle, cursor);
      if (start < 0) break;
      ranges.push({ start, end: start + needle.length });
      cursor = start + 1;
    }
    return ranges;
  }

  private hasAnyOverlap(left: TextRange[], right: TextRange[]): boolean {
    return left.some((leftRange) =>
      right.some(
        (rightRange) =>
          leftRange.start < rightRange.end && rightRange.start < leftRange.end,
      ),
    );
  }

  private async failClaimedAnalysis(
    actingAdminId: string,
    snapshot: ArticleAnalysisSnapshot,
    message: string,
  ): Promise<void> {
    const failed = await this.articlesRepository.failArticleAnalysis(
      snapshot.article.id,
      snapshot.article.contentVersion,
      this.sanitizeError(message),
      actingAdminId,
    );
    if (!failed) {
      throw new ConflictException(
        'Article changed during AI analysis; stale result was not applied',
      );
    }
  }

  private sanitizeError(message: string): string {
    return this.normalizeWhitespace(message)
      .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '')
      .slice(0, MAX_STORED_ANALYSIS_ERROR_LENGTH);
  }
}
