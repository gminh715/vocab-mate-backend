import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  AiGenerationStatus,
  ArticleStatus,
  TermOrigin,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  ArticleAnalysisStateConflictError,
  type ArticleAnalysisCompletionRecord,
  type ArticleAnalysisSentenceRecord,
  type ArticleAnalysisSnapshot,
  type CompleteArticleAnalysisInput,
} from './articles.repository';

export {
  ArticleAnalysisStateConflictError,
  type ArticleAnalysisCompletionRecord,
  type ArticleAnalysisSentenceRecord,
  type ArticleAnalysisSnapshot,
  type CompleteArticleAnalysisInput,
} from './articles.repository';

export type { AnalyzedTermInput } from './articles.repository';

const publicCategorySelect = { id: true, name: true, slug: true } as const;

const isSameAnalysisInventory = (
  current: ArticleAnalysisSentenceRecord[],
  expected: ArticleAnalysisSentenceRecord[],
): boolean =>
  current.length === expected.length &&
  current.every((sentence, sentenceIndex) => {
    const expectedSentence = expected[sentenceIndex];
    return (
      expectedSentence !== undefined &&
      sentence.id === expectedSentence.id &&
      sentence.sentenceOrder === expectedSentence.sentenceOrder &&
      sentence.sentenceText === expectedSentence.sentenceText &&
      sentence.terms.length === expectedSentence.terms.length &&
      sentence.terms.every((term, termIndex) => {
        const expectedTerm = expectedSentence.terms[termIndex];
        return (
          expectedTerm !== undefined &&
          term.id === expectedTerm.id &&
          term.sentenceId === expectedTerm.sentenceId &&
          term.value === expectedTerm.value &&
          term.updatedAt.getTime() === expectedTerm.updatedAt.getTime()
        );
      })
    );
  });

@Injectable()
export class ArticleAnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAnalysisSnapshot(
    articleId: string,
  ): Promise<ArticleAnalysisSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          title: true,
          contentHtml: true,
          contentVersion: true,
          status: true,
          aiAnalysisStatus: true,
        },
      });
      if (!article) return null;
      const sentences = await tx.articleSentence.findMany({
        where: {
          articleId,
          contentVersion: article.contentVersion,
          isActive: true,
        },
        orderBy: [{ sentenceOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          sentenceOrder: true,
          sentenceText: true,
          terms: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              sentenceId: true,
              value: true,
              updatedAt: true,
            },
          },
        },
      });
      return { article, sentences };
    });
  }

  async claimArticleAnalysis(
    articleId: string,
    contentVersion: number,
  ): Promise<boolean> {
    const claimed = await this.prisma.article.updateMany({
      where: {
        id: articleId,
        status: ArticleStatus.DRAFT,
        contentVersion,
        aiAnalysisStatus: {
          in: [AiGenerationStatus.PENDING, AiGenerationStatus.FAILED],
        },
      },
      data: {
        aiAnalysisStatus: AiGenerationStatus.PROCESSING,
        aiAnalysisError: null,
      },
    });
    return claimed.count === 1;
  }

  async failArticleAnalysis(
    articleId: string,
    contentVersion: number,
    aiAnalysisError: string,
  ): Promise<boolean> {
    const failed = await this.prisma.article.updateMany({
      where: {
        id: articleId,
        status: ArticleStatus.DRAFT,
        contentVersion,
        aiAnalysisStatus: AiGenerationStatus.PROCESSING,
      },
      data: {
        aiAnalysisStatus: AiGenerationStatus.FAILED,
        aiAnalysisError,
      },
    });
    return failed.count === 1;
  }

  async completeArticleAnalysis(
    input: CompleteArticleAnalysisInput,
  ): Promise<ArticleAnalysisCompletionRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.article.updateMany({
          where: {
            id: input.articleId,
            status: ArticleStatus.DRAFT,
            contentVersion: input.contentVersion,
            contentHtml: input.sourceContentHtml,
            aiAnalysisStatus: AiGenerationStatus.PROCESSING,
          },
          data: {
            contentHtml: input.annotatedContentHtml,
            cefrLevel: input.articleCefrLevel,
            aiAnalysisStatus: AiGenerationStatus.READY,
            aiAnalysisError: null,
          },
        });
        if (updated.count !== 1) throw new ArticleAnalysisStateConflictError();

        const currentSentences = await tx.articleSentence.findMany({
          where: {
            articleId: input.articleId,
            contentVersion: input.contentVersion,
            isActive: true,
          },
          orderBy: [{ sentenceOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            sentenceOrder: true,
            sentenceText: true,
            terms: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                sentenceId: true,
                value: true,
                updatedAt: true,
              },
            },
          },
        });
        if (
          !isSameAnalysisInventory(currentSentences, input.expectedSentences)
        ) {
          throw new ArticleAnalysisStateConflictError();
        }
        if (input.terms.length > 0) {
          await tx.articleSentenceTerm.createMany({
            data: input.terms.map((term) => ({
              ...term,
              partOfSpeech: null,
              origin: TermOrigin.NLP,
              reviewStatus: TermReviewStatus.APPROVED,
              explanationStatus: AiGenerationStatus.PENDING,
              contextualMeaningVi: null,
              definitionEn: null,
              contextualExplanation: null,
              ipa: null,
              synonyms: [],
              antonyms: [],
              collocations: [],
              relatedTerms: [],
              examples: [],
              explanationError: null,
              isActive: true,
              isLookupEnabled: true,
            })),
          });
        }
        const article = await tx.article.findUnique({
          where: { id: input.articleId },
          select: {
            id: true,
            contentVersion: true,
            aiAnalysisStatus: true,
            cefrLevel: true,
            category: { select: publicCategorySelect },
          },
        });
        if (!article || article.aiAnalysisStatus !== AiGenerationStatus.READY) {
          throw new ArticleAnalysisStateConflictError();
        }
        return {
          articleId: article.id,
          contentVersion: article.contentVersion,
          aiAnalysisStatus: article.aiAnalysisStatus,
          category: article.category,
          cefrLevel: article.cefrLevel,
          candidateCount: input.terms.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
