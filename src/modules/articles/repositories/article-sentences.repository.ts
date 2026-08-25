import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  AiGenerationStatus,
  ArticleStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  ArticleParseStateConflictError,
  type ArticleSentenceDetailRecord,
  type ArticleSentenceListResult,
  type ArticleSentenceRecord,
  type ReplaceParsedContentInput,
  type UpdateArticleSentenceInput,
} from './articles.repository';

export {
  ArticleParseStateConflictError,
  type ArticleSentenceDetailRecord,
  type ArticleSentenceListResult,
  type ArticleSentenceRecord,
  type ReplaceParsedContentInput,
  type UpdateArticleSentenceInput,
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
export class ArticleSentencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  countSentences(articleId: string, contentVersion: number): Promise<number> {
    return this.prisma.articleSentence.count({
      where: { articleId, contentVersion },
    });
  }

  async replaceParsedContent(input: ReplaceParsedContentInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.article.updateMany({
        where: {
          id: input.articleId,
          contentVersion: input.contentVersion,
          contentHtml: input.sourceContentHtml,
          status: { not: ArticleStatus.ARCHIVED },
        },
        data: {
          contentHtml: input.annotatedContentHtml,
          updatedByUserId: input.actingAdminId,
          ...(input.resetAiAnalysis
            ? {
                aiAnalysisStatus: AiGenerationStatus.PENDING,
                aiAnalysisError: null,
              }
            : {}),
        },
      });
      if (updated.count !== 1) throw new ArticleParseStateConflictError();

      await tx.articleSentence.deleteMany({
        where: {
          articleId: input.articleId,
          contentVersion: input.contentVersion,
        },
      });
      await tx.articleSentence.createMany({
        data: input.sentences.map((sentence) => ({
          ...sentence,
          articleId: input.articleId,
          contentVersion: input.contentVersion,
          createdByUserId: input.actingAdminId,
          updatedByUserId: input.actingAdminId,
        })),
      });
    });
  }

  async findSentences(
    articleId: string,
    query: { page: number; limit: number; isActive?: boolean },
  ): Promise<ArticleSentenceListResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: { contentVersion: true },
      });
      if (!article) return null;
      const where: Prisma.ArticleSentenceWhereInput = {
        articleId,
        contentVersion: article.contentVersion,
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      };
      const items = await tx.articleSentence.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sentenceOrder: 'asc' }, { id: 'asc' }],
        select: articleSentenceSelect,
      });
      const total = await tx.articleSentence.count({ where });
      return { contentVersion: article.contentVersion, items, total };
    });
  }

  async findSentenceDetail(
    articleId: string,
    sentenceId: string,
  ): Promise<ArticleSentenceDetailRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: { contentVersion: true },
      });
      if (!article) return null;
      const result = await tx.articleSentence.findFirst({
        where: {
          id: sentenceId,
          articleId,
          contentVersion: article.contentVersion,
        },
        select: {
          ...articleSentenceSelect,
          terms: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: articleSentenceTermSelect,
          },
        },
      });
      if (!result) return null;
      const { terms, ...sentence } = result;
      return { sentence, terms };
    });
  }

  async updateSentence(
    articleId: string,
    sentenceId: string,
    input: UpdateArticleSentenceInput,
  ): Promise<ArticleSentenceRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: { contentVersion: true },
      });
      if (!article) return null;
      const updated = await tx.articleSentence.updateMany({
        where: {
          id: sentenceId,
          articleId,
          contentVersion: article.contentVersion,
        },
        data: input,
      });
      if (updated.count !== 1) return null;
      return tx.articleSentence.findUnique({
        where: { id: sentenceId },
        select: articleSentenceSelect,
      });
    });
  }
}
