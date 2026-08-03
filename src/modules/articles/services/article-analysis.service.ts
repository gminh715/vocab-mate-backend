import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import winkNLP, { type ItemToken } from 'wink-nlp';
import winkEnglishModel from 'wink-eng-lite-web-model';
import {
  AiGenerationStatus,
  ArticleStatus,
} from '../../../../generated/prisma/enums';
import { HtmlSanitizerHelper } from '../helpers/html-sanitizer.helper';
import { TermMarkerHelper } from '../helpers/term-marker.helper';
import {
  ArticleAnalysisStateConflictError,
  type ArticleAnalysisCompletionRecord,
  type ArticleAnalysisSentenceRecord,
  type ArticleAnalysisSnapshot,
  type AnalyzedTermInput,
  ArticlesRepository,
} from '../repositories/articles.repository';

const MAX_STORED_ANALYSIS_ERROR_LENGTH = 500;
const ENGLISH_VOCABULARY_TOKEN = /^[A-Za-z]+(?:['’][A-Za-z]+)*$/u;
const nlp = winkNLP(winkEnglishModel);
const { its } = nlp;

@Injectable()
export class ArticleAnalysisService {
  constructor(private readonly articlesRepository: ArticlesRepository) {}

  async analyze(
    actingAdminId: string,
    articleId: string,
  ): Promise<ArticleAnalysisCompletionRecord> {
    const snapshot =
      await this.articlesRepository.findAnalysisSnapshot(articleId);
    if (!snapshot) throw new NotFoundException('Article not found');
    this.requireEligibleSnapshot(snapshot);

    const claimed = await this.articlesRepository.claimArticleAnalysis(
      articleId,
      snapshot.article.contentVersion,
    );
    if (!claimed) {
      throw new ConflictException(
        'Article analysis is already processing or its state changed',
      );
    }

    let terms: AnalyzedTermInput[];
    let annotatedContentHtml: string;
    try {
      terms = this.extractTerms(snapshot.sentences, actingAdminId);
      annotatedContentHtml = HtmlSanitizerHelper.sanitize(
        terms.reduce(
          (contentHtml, term) =>
            TermMarkerHelper.insertFirst(
              contentHtml,
              term.sentenceId,
              term.id,
              term.value,
              'WORD',
            ),
          snapshot.article.contentHtml,
        ),
      );
    } catch (error: unknown) {
      await this.failClaimedAnalysis(
        actingAdminId,
        snapshot,
        'Vocabulary analysis could not be completed',
      );
      throw error;
    }

    try {
      return await this.articlesRepository.completeArticleAnalysis({
        articleId,
        contentVersion: snapshot.article.contentVersion,
        sourceContentHtml: snapshot.article.contentHtml,
        annotatedContentHtml,
        actingAdminId,
        expectedSentences: snapshot.sentences,
        terms,
      });
    } catch (error: unknown) {
      if (error instanceof ArticleAnalysisStateConflictError) {
        await this.articlesRepository.failArticleAnalysis(
          articleId,
          snapshot.article.contentVersion,
          this.sanitizeError(
            'Article changed during vocabulary analysis; retry',
          ),
          actingAdminId,
        );
        throw new ConflictException(
          'Article changed during vocabulary analysis; stale result was not applied',
        );
      }

      await this.articlesRepository.failArticleAnalysis(
        articleId,
        snapshot.article.contentVersion,
        this.sanitizeError('Vocabulary analysis could not be saved'),
        actingAdminId,
      );
      throw error;
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
      throw new ConflictException('Article is not eligible for analysis');
    }
  }

  private extractTerms(
    sentences: ArticleAnalysisSentenceRecord[],
    actingAdminId: string,
  ): AnalyzedTermInput[] {
    const terms: AnalyzedTermInput[] = [];

    for (const sentence of sentences) {
      const duplicateKeys = new Set<string>();
      for (const existingTerm of sentence.terms) {
        duplicateKeys.add(this.duplicateKey(existingTerm.value));
        nlp
          .readDoc(existingTerm.value)
          .tokens()
          .each((token: ItemToken) => {
            // WinkNLP identifies property helpers by their original function identity.
            // eslint-disable-next-line @typescript-eslint/unbound-method
            if (token.out(its.type) === 'word') {
              duplicateKeys.add(
                this.duplicateKey(
                  // eslint-disable-next-line @typescript-eslint/unbound-method
                  String(token.out(its.normal)),
                ),
              );
            }
          });
      }
      const tokens = nlp.readDoc(sentence.sentenceText).tokens();

      tokens.each((token: ItemToken) => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        if (token.out(its.type) !== 'word') return;

        const surface = token.out().trim();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const normalizedSurface = String(token.out(its.normal)).trim();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const lemma = String(token.out(its.lemma))
          .trim()
          .toLocaleLowerCase('en-US');
        if (
          !ENGLISH_VOCABULARY_TOKEN.test(surface) ||
          !ENGLISH_VOCABULARY_TOKEN.test(normalizedSurface) ||
          !ENGLISH_VOCABULARY_TOKEN.test(lemma) ||
          !TermMarkerHelper.matchesText(sentence.sentenceText, surface, 'WORD')
        ) {
          return;
        }

        const duplicateKey = this.duplicateKey(normalizedSurface);
        if (duplicateKeys.has(duplicateKey)) return;
        duplicateKeys.add(duplicateKey);

        terms.push({
          id: randomUUID(),
          sentenceId: sentence.id,
          value: surface,
          lemma,
          createdByUserId: actingAdminId,
          updatedByUserId: actingAdminId,
        });
      });
    }

    return terms;
  }

  private duplicateKey(value: string): string {
    return value.trim().toLocaleLowerCase('en-US');
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
        'Article changed during vocabulary analysis; stale result was not applied',
      );
    }
  }

  private sanitizeError(message: string): string {
    return message
      .replace(/\s+/gu, ' ')
      .trim()
      .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '')
      .slice(0, MAX_STORED_ANALYSIS_ERROR_LENGTH);
  }
}
