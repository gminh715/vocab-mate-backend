import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  AiGenerationStatus,
  ArticleStatus,
  type CefrLevel,
  LexicalUnitType,
  TermOrigin,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  ArticleTermReferencedError,
  ArticleTermStateConflictError,
  type ArticleSentenceTermRecord,
  type ArticleTermDetailRecord,
  type ArticleTermListResult,
  type ArticleTermMutationContext,
  type CreateArticleTermInput,
  type SentenceTermContext,
  type TermMarkerWriteInput,
  type UpdateArticleTermInput,
} from './articles.repository';

export {
  ArticleTermReferencedError,
  ArticleTermStateConflictError,
  type ArticleSentenceTermRecord,
  type ArticleTermDetailRecord,
  type ArticleTermListResult,
  type ArticleTermMutationContext,
  type CreateArticleTermInput,
  type SentenceTermContext,
  type TermMarkerWriteInput,
  type UpdateArticleTermInput,
} from './articles.repository';

const articleSentenceSelect = {
  id: true,
  articleId: true,
  contentVersion: true,
  sentenceOrder: true,
  sentenceText: true,
  translationVi: true,
  explanationVi: true,
  referenceExplanation: true,
  skill: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
const articleSentenceTermSelect = {
  id: true,
  sentenceId: true,
  value: true,
  wordDisplay: true,
  lemma: true,
  normalizedLemma: true,
  unitType: true,
  partOfSpeech: true,
  ipa: true,
  cefrLevel: true,
  contextualMeaningVi: true,
  definitionEn: true,
  contextualExplanation: true,
  synonyms: true,
  antonyms: true,
  collocations: true,
  relatedTerms: true,
  vocabularyTopic: true,
  examples: true,
  skill: true,
  origin: true,
  reviewStatus: true,
  selectionReason: true,
  explanationStatus: true,
  explanationError: true,
  explanationGeneratedAt: true,
  isLookupEnabled: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ArticleTermsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSentenceTermContext(
    articleId: string,
    sentenceId: string,
  ): Promise<SentenceTermContext | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          status: true,
          contentHtml: true,
          contentVersion: true,
        },
      });
      if (!article) return null;
      const sentence = await tx.articleSentence.findFirst({
        where: {
          id: sentenceId,
          articleId,
          contentVersion: article.contentVersion,
        },
        select: articleSentenceSelect,
      });
      return sentence ? { article, sentence } : null;
    });
  }

  async createTermWithMarker(
    marker: TermMarkerWriteInput,
    input: CreateArticleTermInput,
  ): Promise<ArticleSentenceTermRecord> {
    return this.prisma.$transaction(async (tx) => {
      const currentSentenceCount = await tx.articleSentence.count({
        where: {
          id: marker.sentenceId,
          articleId: marker.articleId,
          contentVersion: marker.contentVersion,
          isActive: true,
        },
      });
      if (currentSentenceCount !== 1) throw new ArticleTermStateConflictError();
      const articleUpdate = await tx.article.updateMany({
        where: {
          id: marker.articleId,
          contentVersion: marker.contentVersion,
          contentHtml: marker.sourceContentHtml,
          status: { not: ArticleStatus.ARCHIVED },
        },
        data: {
          contentHtml: marker.updatedContentHtml,
          updatedByUserId: marker.actingAdminId,
        },
      });
      if (articleUpdate.count !== 1) throw new ArticleTermStateConflictError();
      return tx.articleSentenceTerm.create({
        data: {
          ...input,
          origin: TermOrigin.MANUAL,
          reviewStatus: TermReviewStatus.APPROVED,
          explanationStatus: AiGenerationStatus.READY,
        },
        select: articleSentenceTermSelect,
      });
    });
  }

  async approveAiTermWithMarker(
    marker: TermMarkerWriteInput,
  ): Promise<ArticleSentenceTermRecord> {
    return this.prisma.$transaction(async (tx) => {
      const currentSentenceCount = await tx.articleSentence.count({
        where: {
          id: marker.sentenceId,
          articleId: marker.articleId,
          contentVersion: marker.contentVersion,
          isActive: true,
        },
      });
      if (currentSentenceCount !== 1) throw new ArticleTermStateConflictError();
      const articleUpdate = await tx.article.updateMany({
        where: {
          id: marker.articleId,
          status: ArticleStatus.DRAFT,
          contentVersion: marker.contentVersion,
          contentHtml: marker.sourceContentHtml,
        },
        data: {
          contentHtml: marker.updatedContentHtml,
          updatedByUserId: marker.actingAdminId,
        },
      });
      if (articleUpdate.count !== 1) throw new ArticleTermStateConflictError();
      const termUpdate = await tx.articleSentenceTerm.updateMany({
        where: {
          id: marker.termId,
          sentenceId: marker.sentenceId,
          origin: TermOrigin.AI,
          reviewStatus: TermReviewStatus.PENDING,
          isActive: false,
          isLookupEnabled: false,
        },
        data: {
          reviewStatus: TermReviewStatus.APPROVED,
          isActive: true,
          isLookupEnabled: true,
          updatedByUserId: marker.actingAdminId,
        },
      });
      if (termUpdate.count !== 1) throw new ArticleTermStateConflictError();
      const term = await tx.articleSentenceTerm.findUnique({
        where: { id: marker.termId },
        select: articleSentenceTermSelect,
      });
      if (!term) throw new ArticleTermStateConflictError();
      return term;
    });
  }

  async rejectAiTerm(
    articleId: string,
    contentVersion: number,
    termId: string,
    actingAdminId: string,
  ): Promise<ArticleSentenceTermRecord> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.articleSentenceTerm.updateMany({
        where: {
          id: termId,
          origin: TermOrigin.AI,
          reviewStatus: TermReviewStatus.PENDING,
          sentence: {
            is: {
              articleId,
              contentVersion,
              article: { is: { contentVersion, status: ArticleStatus.DRAFT } },
            },
          },
        },
        data: {
          reviewStatus: TermReviewStatus.REJECTED,
          isActive: false,
          isLookupEnabled: false,
          updatedByUserId: actingAdminId,
        },
      });
      if (updated.count !== 1) throw new ArticleTermStateConflictError();
      const term = await tx.articleSentenceTerm.findUnique({
        where: { id: termId },
        select: articleSentenceTermSelect,
      });
      if (!term) throw new ArticleTermStateConflictError();
      return term;
    });
  }

  async findTerms(
    articleId: string,
    query: {
      page: number;
      limit: number;
      sentenceId?: string;
      cefrLevel?: CefrLevel;
      unitType?: LexicalUnitType;
      origin?: TermOrigin;
      reviewStatus?: TermReviewStatus;
      explanationStatus?: AiGenerationStatus;
      isActive?: boolean;
      q?: string;
    },
  ): Promise<ArticleTermListResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: { contentVersion: true },
      });
      if (!article) return null;
      const where: Prisma.ArticleSentenceTermWhereInput = {
        ...(query.sentenceId ? { sentenceId: query.sentenceId } : {}),
        ...(query.cefrLevel ? { cefrLevel: query.cefrLevel } : {}),
        ...(query.unitType ? { unitType: query.unitType } : {}),
        ...(query.origin ? { origin: query.origin } : {}),
        ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
        ...(query.explanationStatus
          ? { explanationStatus: query.explanationStatus }
          : {}),
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
        ...(query.q
          ? {
              OR: [
                { value: { contains: query.q, mode: 'insensitive' } },
                { wordDisplay: { contains: query.q, mode: 'insensitive' } },
                { lemma: { contains: query.q, mode: 'insensitive' } },
                { normalizedLemma: { contains: query.q, mode: 'insensitive' } },
                { partOfSpeech: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        sentence: { is: { articleId, contentVersion: article.contentVersion } },
      };
      const rows = await tx.articleSentenceTerm.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { sentence: { sentenceOrder: 'asc' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        select: {
          ...articleSentenceTermSelect,
          sentence: { select: { sentenceOrder: true } },
        },
      });
      const total = await tx.articleSentenceTerm.count({ where });
      return {
        contentVersion: article.contentVersion,
        total,
        items: rows.map(({ sentence, ...term }) => ({
          ...term,
          sentenceOrder: sentence.sentenceOrder,
          hasDefinitionEn: Boolean(term.definitionEn),
          hasContextualExplanation: Boolean(term.contextualExplanation),
          hasExamples: Array.isArray(term.examples) && term.examples.length > 0,
        })),
      };
    });
  }

  async findTermDetail(
    articleId: string,
    termId: string,
  ): Promise<ArticleTermDetailRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: { contentVersion: true },
      });
      if (!article) return null;
      const row = await tx.articleSentenceTerm.findFirst({
        where: {
          id: termId,
          sentence: {
            is: { articleId, contentVersion: article.contentVersion },
          },
        },
        select: {
          ...articleSentenceTermSelect,
          sentence: { select: articleSentenceSelect },
        },
      });
      if (!row) return null;
      const { sentence, ...term } = row;
      return { term, sentence };
    });
  }

  async findTermMutationContext(
    articleId: string,
    termId: string,
  ): Promise<ArticleTermMutationContext | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          status: true,
          contentHtml: true,
          contentVersion: true,
        },
      });
      if (!article) return null;
      const row = await tx.articleSentenceTerm.findFirst({
        where: {
          id: termId,
          sentence: {
            is: { articleId, contentVersion: article.contentVersion },
          },
        },
        select: {
          ...articleSentenceTermSelect,
          sentence: { select: articleSentenceSelect },
        },
      });
      if (!row) return null;
      const { sentence, ...term } = row;
      return { article, term, sentence };
    });
  }

  async updateTermMetadata(
    articleId: string,
    contentVersion: number,
    termId: string,
    input: UpdateArticleTermInput,
  ): Promise<ArticleSentenceTermRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.articleSentenceTerm.updateMany({
        where: {
          id: termId,
          sentence: {
            is: {
              articleId,
              contentVersion,
              article: {
                is: { contentVersion, status: { not: ArticleStatus.ARCHIVED } },
              },
            },
          },
        },
        data: input,
      });
      if (updated.count !== 1) return null;
      return tx.articleSentenceTerm.findUnique({
        where: { id: termId },
        select: articleSentenceTermSelect,
      });
    });
  }

  async updateTermWithMarker(
    marker: TermMarkerWriteInput,
    input: UpdateArticleTermInput,
  ): Promise<ArticleSentenceTermRecord> {
    return this.prisma.$transaction(async (tx) => {
      const currentSentenceCount = await tx.articleSentence.count({
        where: {
          id: marker.sentenceId,
          articleId: marker.articleId,
          contentVersion: marker.contentVersion,
          isActive: true,
        },
      });
      if (currentSentenceCount !== 1) throw new ArticleTermStateConflictError();
      const articleUpdate = await tx.article.updateMany({
        where: {
          id: marker.articleId,
          contentVersion: marker.contentVersion,
          contentHtml: marker.sourceContentHtml,
          status: { not: ArticleStatus.ARCHIVED },
        },
        data: {
          contentHtml: marker.updatedContentHtml,
          updatedByUserId: marker.actingAdminId,
        },
      });
      if (articleUpdate.count !== 1) throw new ArticleTermStateConflictError();
      const updated = await tx.articleSentenceTerm.updateMany({
        where: { id: marker.termId, sentenceId: marker.sentenceId },
        data: input,
      });
      if (updated.count !== 1) throw new ArticleTermStateConflictError();
      const term = await tx.articleSentenceTerm.findUnique({
        where: { id: marker.termId },
        select: articleSentenceTermSelect,
      });
      if (!term) throw new ArticleTermStateConflictError();
      return term;
    });
  }

  async deleteTermWithMarker(marker: TermMarkerWriteInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const currentTermCount = await tx.articleSentenceTerm.count({
        where: {
          id: marker.termId,
          sentenceId: marker.sentenceId,
          sentence: {
            is: {
              articleId: marker.articleId,
              contentVersion: marker.contentVersion,
            },
          },
        },
      });
      if (currentTermCount !== 1) throw new ArticleTermStateConflictError();
      const [savedVocabularyCount, reviewQuestionCount, reviewAnswerCount] =
        await Promise.all([
          tx.userVocabulary.count({
            where: { articleSentenceTermId: marker.termId },
          }),
          tx.reviewQuestion.count({
            where: { articleSentenceTermId: marker.termId },
          }),
          tx.reviewAnswer.count({
            where: {
              reviewSessionItem: {
                is: {
                  reviewQuestion: {
                    is: { articleSentenceTermId: marker.termId },
                  },
                },
              },
            },
          }),
        ]);
      if (
        savedVocabularyCount > 0 ||
        reviewQuestionCount > 0 ||
        reviewAnswerCount > 0
      ) {
        throw new ArticleTermReferencedError();
      }
      const articleUpdate = await tx.article.updateMany({
        where: {
          id: marker.articleId,
          contentVersion: marker.contentVersion,
          contentHtml: marker.sourceContentHtml,
          status: { not: ArticleStatus.ARCHIVED },
        },
        data: {
          contentHtml: marker.updatedContentHtml,
          updatedByUserId: marker.actingAdminId,
        },
      });
      if (articleUpdate.count !== 1) throw new ArticleTermStateConflictError();
      const deleted = await tx.articleSentenceTerm.deleteMany({
        where: {
          id: marker.termId,
          sentenceId: marker.sentenceId,
          sentence: {
            is: {
              articleId: marker.articleId,
              contentVersion: marker.contentVersion,
            },
          },
        },
      });
      if (deleted.count !== 1) throw new ArticleTermStateConflictError();
    });
  }
}
