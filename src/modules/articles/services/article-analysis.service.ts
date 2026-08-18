import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import cefrAnalyzer, {
  calculateComplexityScore,
  type CEFRLevel as AnalyzerCefrLevel,
} from 'cefr-analyzer';
import { randomUUID } from 'node:crypto';
import winkNLP, { type ItemToken } from 'wink-nlp';
import winkEnglishModel from 'wink-eng-lite-web-model';
import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
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
const ANALYZER_CEFR_LEVELS = [
  'a1',
  'a2',
  'b1',
  'b2',
  'c1',
  'c2',
] as const satisfies readonly AnalyzerCefrLevel[];
const nlp = winkNLP(winkEnglishModel);
const { its } = nlp;

interface LocalCefrAnalysis {
  articleCefrLevel: CefrLevel;
  termLevels: ReadonlyMap<string, CefrLevel>;
}

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
    let articleCefrLevel: CefrLevel;
    try {
      const cefrAnalysis = this.analyzeCefr(snapshot.sentences);
      articleCefrLevel = cefrAnalysis.articleCefrLevel;
      terms = this.extractTerms(
        snapshot.sentences,
        actingAdminId,
        cefrAnalysis.termLevels,
      );
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
        articleCefrLevel,
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
    termCefrLevels: ReadonlyMap<string, CefrLevel>,
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
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const partOfSpeech = String(token.out(its.pos)).trim();
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
          cefrLevel:
            termCefrLevels.get(this.cefrTermKey(surface, partOfSpeech)) ?? null,
          createdByUserId: actingAdminId,
          updatedByUserId: actingAdminId,
        });
      });
    }

    return terms;
  }

  private analyzeCefr(
    sentences: ArticleAnalysisSentenceRecord[],
  ): LocalCefrAnalysis {
    const analysis = cefrAnalyzer.analyze(
      sentences.map(({ sentenceText }) => sentenceText).join(' '),
      {
        caseSensitive: false,
        includeUnknownWords: true,
        analyzeByPartOfSpeech: true,
      },
    );
    const termLevels = new Map<string, CefrLevel>();
    let classifiedWordCount = 0;

    for (const analyzerLevel of ANALYZER_CEFR_LEVELS) {
      classifiedWordCount += analysis.levelCounts[analyzerLevel];
      const cefrLevel = this.toCefrLevel(analyzerLevel);
      if (!cefrLevel) continue;

      for (const word of analysis.wordsAtLevel[analyzerLevel]) {
        termLevels.set(this.cefrTermKey(word.word, word.pos), cefrLevel);
      }
    }

    if (classifiedWordCount === 0) {
      throw new UnprocessableEntityException(
        'CEFR analysis could not classify any vocabulary in the article',
      );
    }

    const articleCefrLevel = this.toCefrLevel(
      calculateComplexityScore(analysis).level,
    );
    if (!articleCefrLevel) {
      throw new UnprocessableEntityException(
        'CEFR analysis returned an unsupported article level',
      );
    }

    return { articleCefrLevel, termLevels };
  }

  private cefrTermKey(value: string, partOfSpeech: string): string {
    return `${this.duplicateKey(value)}\u0000${partOfSpeech.trim().toUpperCase()}`;
  }

  private toCefrLevel(value: unknown): CefrLevel | null {
    switch (value) {
      case 'a1':
        return CefrLevel.A1;
      case 'a2':
        return CefrLevel.A2;
      case 'b1':
        return CefrLevel.B1;
      case 'b2':
        return CefrLevel.B2;
      case 'c1':
        return CefrLevel.C1;
      case 'c2':
        return CefrLevel.C2;
      default:
        return null;
    }
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
