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

export interface PublicArticleCategoryRecord {
  id: string;
  name: string;
  slug: string;
}

export interface PublicArticleCardRecord {
  id: string;
  title: string;
  slug: string;
  summary: string;
  thumbnailUrl: string | null;
  cefrLevel: CefrLevel;
  publishedAt: Date | null;
  category: PublicArticleCategoryRecord;
}

export interface PublicArticleMetadataRecord {
  id: string;
  title: string;
  slug: string;
  summary: string;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  cefrLevel: CefrLevel;
  status: ArticleStatus;
  publishedAt: Date | null;
}

export interface PublicArticleDetailRecord {
  article: PublicArticleMetadataRecord;
  category: PublicArticleCategoryRecord;
}

export interface FindPublishedArticlesQuery {
  page: number;
  limit: number;
  q?: string;
  categorySlug?: string;
  cefrLevel?: CefrLevel;
  sort: 'newest' | 'oldest';
}

export interface PublicArticleListResult {
  items: PublicArticleCardRecord[];
  total: number;
}

export interface AdminArticleListQuery {
  page: number;
  limit: number;
  q?: string;
  categoryId?: string;
  cefrLevel?: CefrLevel;
  status?: ArticleStatus;
  sort: 'newest' | 'oldest';
}

export interface AdminArticleListRecord extends PublicArticleCardRecord {
  categoryId: string;
  importSource: string | null;
  externalId: string | null;
  canonicalUrl: string | null;
  contentHash: string | null;
  sourcePublishedAt: Date | null;
  aiAnalysisStatus: AiGenerationStatus | null;
  aiAnalysisError: string | null;
  status: ArticleStatus;
  contentVersion: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminArticleListResult {
  items: AdminArticleListRecord[];
  total: number;
}

export interface AdminArticleRecord {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  contentVersion: number;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  importSource: string | null;
  externalId: string | null;
  canonicalUrl: string | null;
  contentHash: string | null;
  sourcePublishedAt: Date | null;
  aiAnalysisStatus: AiGenerationStatus | null;
  aiAnalysisError: string | null;
  cefrLevel: CefrLevel;
  status: ArticleStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: PublicArticleCategoryRecord;
}

export interface AdminArticleDetailRecord {
  article: AdminArticleRecord;
  sentenceCount: number;
  termCount: number;
}

export interface CreateArticleInput {
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  cefrLevel: CefrLevel;
  sourceName?: string;
  sourceUrl?: string;
  authorName?: string;
  thumbnailUrl?: string;
  createdByUserId: string;
  updatedByUserId: string;
}

export interface CreateImportedArticleInput extends CreateArticleInput {
  importSource: string;
  externalId: string;
  canonicalUrl: string;
  contentHash: string;
  sourcePublishedAt: Date;
  aiAnalysisStatus: AiGenerationStatus;
}

export interface ImportedArticleDuplicateLookup {
  importSource?: string;
  externalId?: string;
  canonicalUrl?: string;
  contentHash?: string;
}

export interface ImportedArticleDuplicateRecord {
  id: string;
}

export interface UpdateArticleInput {
  categoryId?: string;
  title?: string;
  slug?: string;
  summary?: string;
  contentHtml?: string;
  cefrLevel?: CefrLevel;
  sourceName?: string;
  sourceUrl?: string;
  authorName?: string;
  thumbnailUrl?: string;
  updatedByUserId: string;
}

export interface ArticleMutationState {
  id: string;
  status: ArticleStatus;
  contentHtml: string;
  contentVersion: number;
}

export interface ArticleAnalysisTermInventoryRecord {
  id: string;
  sentenceId: string;
  value: string;
  unitType: LexicalUnitType;
  updatedAt: Date;
}

export interface ArticleAnalysisSentenceRecord {
  id: string;
  sentenceOrder: number;
  sentenceText: string;
  terms: ArticleAnalysisTermInventoryRecord[];
}

export interface ArticleAnalysisSnapshot {
  article: {
    id: string;
    title: string;
    contentHtml: string;
    contentVersion: number;
    status: ArticleStatus;
    aiAnalysisStatus: AiGenerationStatus | null;
  };
  sentences: ArticleAnalysisSentenceRecord[];
}

export interface AnalyzedTermInput {
  id: string;
  sentenceId: string;
  value: string;
  lemma: string;
  cefrLevel: CefrLevel | null;
  createdByUserId: string;
  updatedByUserId: string;
}

export interface CompleteArticleAnalysisInput {
  articleId: string;
  contentVersion: number;
  sourceContentHtml: string;
  annotatedContentHtml: string;
  actingAdminId: string;
  expectedSentences: ArticleAnalysisSentenceRecord[];
  articleCefrLevel: CefrLevel;
  terms: AnalyzedTermInput[];
}

export interface ArticleAnalysisCompletionRecord {
  articleId: string;
  contentVersion: number;
  aiAnalysisStatus: AiGenerationStatus;
  category: PublicArticleCategoryRecord;
  cefrLevel: CefrLevel;
  candidateCount: number;
}

export interface ArticleDeleteSafetyRecord {
  id: string;
  status: ArticleStatus;
  readingProgressCount: number;
  savedVocabularyCount: number;
  reviewAnswerCount: number;
}

export interface ArticleSentenceRecord {
  id: string;
  articleId: string;
  contentVersion: number;
  sentenceOrder: number;
  sentenceText: string;
  translationVi: string | null;
  explanationVi: string | null;
  referenceExplanation: string | null;
  skill: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArticleSentenceTermRecord {
  id: string;
  sentenceId: string;
  value: string;
  wordDisplay: string | null;
  lemma: string;
  normalizedLemma: string | null;
  unitType: LexicalUnitType;
  partOfSpeech: string | null;
  ipa: string | null;
  cefrLevel: CefrLevel | null;
  contextualMeaningVi: string | null;
  definitionEn: string | null;
  contextualExplanation: string | null;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  vocabularyTopic: string | null;
  examples: Prisma.JsonValue;
  skill: string | null;
  origin: TermOrigin;
  reviewStatus: TermReviewStatus;
  selectionReason: string | null;
  explanationStatus: AiGenerationStatus;
  explanationError: string | null;
  explanationGeneratedAt: Date | null;
  isLookupEnabled: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArticleTermListRecord extends ArticleSentenceTermRecord {
  sentenceOrder: number;
  hasDefinitionEn: boolean;
  hasContextualExplanation: boolean;
  hasExamples: boolean;
}

export interface ArticleTermListResult {
  contentVersion: number;
  items: ArticleTermListRecord[];
  total: number;
}

export interface ArticleTermDetailRecord {
  term: ArticleSentenceTermRecord;
  sentence: ArticleSentenceRecord;
}

export interface SentenceTermContext {
  article: ArticleMutationState;
  sentence: ArticleSentenceRecord;
}

export interface ArticleTermMutationContext extends ArticleTermDetailRecord {
  article: ArticleMutationState;
}

export interface ArticlePublicationArticleRecord {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  contentVersion: number;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  cefrLevel: CefrLevel;
  status: ArticleStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
  category: PublicArticleCategoryRecord & { isActive: boolean };
}

export interface ArticlePublicationSentenceRecord extends ArticleSentenceRecord {
  terms: ArticleSentenceTermRecord[];
}

export interface ArticlePublicationSnapshot {
  article: ArticlePublicationArticleRecord;
  sentences: ArticlePublicationSentenceRecord[];
}

export interface ArticleStatusTransitionRecord {
  id: string;
  status: ArticleStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

export interface ArticleStatusTransitionInput {
  articleId: string;
  expectedStatus: ArticleStatus;
  expectedContentVersion: number;
  expectedContentHtml: string;
  requireActiveCategory?: boolean;
  status: ArticleStatus;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  updatedByUserId: string;
}

export interface CreateArticleTermInput {
  id: string;
  sentenceId: string;
  value: string;
  wordDisplay: string;
  lemma: string;
  normalizedLemma: string;
  unitType: LexicalUnitType;
  partOfSpeech: string;
  ipa?: string;
  cefrLevel: CefrLevel;
  contextualMeaningVi: string;
  definitionEn?: string;
  contextualExplanation?: string;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  vocabularyTopic?: string;
  examples: Prisma.InputJsonValue;
  skill?: string;
  isLookupEnabled: boolean;
  isActive: boolean;
  createdByUserId: string;
  updatedByUserId: string;
}

export type UpdateArticleTermInput = Partial<
  Omit<
    CreateArticleTermInput,
    'id' | 'sentenceId' | 'createdByUserId' | 'updatedByUserId'
  >
> & { updatedByUserId: string };

export interface TermMarkerWriteInput {
  articleId: string;
  sentenceId: string;
  termId: string;
  contentVersion: number;
  sourceContentHtml: string;
  updatedContentHtml: string;
  actingAdminId: string;
}

export class ArticleTermStateConflictError extends Error {}
export class ArticleTermReferencedError extends Error {}
export class ArticleStatusTransitionConflictError extends Error {}
export class ArticleAnalysisStateConflictError extends Error {}

export interface ArticleSentenceListResult {
  contentVersion: number;
  items: ArticleSentenceRecord[];
  total: number;
}

export interface ArticleSentenceDetailRecord {
  sentence: ArticleSentenceRecord;
  terms: ArticleSentenceTermRecord[];
}

export interface UpdateArticleSentenceInput {
  translationVi?: string;
  explanationVi?: string;
  referenceExplanation?: string;
  skill?: string;
  isActive?: boolean;
  updatedByUserId: string;
}

export interface ReplaceParsedContentInput {
  articleId: string;
  contentVersion: number;
  sourceContentHtml: string;
  annotatedContentHtml: string;
  actingAdminId: string;
  resetAiAnalysis: boolean;
  sentences: Array<{
    id: string;
    sentenceOrder: number;
    sentenceText: string;
  }>;
}

export class ArticleParseStateConflictError extends Error {
  constructor() {
    super('Article content changed while parsing');
  }
}

const publicCategorySelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const publicArticleCardSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  thumbnailUrl: true,
  cefrLevel: true,
  publishedAt: true,
  category: { select: publicCategorySelect },
} as const;

const publicArticleMetadataSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  sourceName: true,
  sourceUrl: true,
  authorName: true,
  thumbnailUrl: true,
  cefrLevel: true,
  status: true,
  publishedAt: true,
} as const;

const adminArticleListSelect = {
  ...publicArticleCardSelect,
  categoryId: true,
  importSource: true,
  externalId: true,
  canonicalUrl: true,
  contentHash: true,
  sourcePublishedAt: true,
  aiAnalysisStatus: true,
  aiAnalysisError: true,
  status: true,
  contentVersion: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const adminArticleSelect = {
  id: true,
  categoryId: true,
  title: true,
  slug: true,
  summary: true,
  contentHtml: true,
  contentVersion: true,
  sourceName: true,
  sourceUrl: true,
  authorName: true,
  thumbnailUrl: true,
  importSource: true,
  externalId: true,
  canonicalUrl: true,
  contentHash: true,
  sourcePublishedAt: true,
  aiAnalysisStatus: true,
  aiAnalysisError: true,
  cefrLevel: true,
  status: true,
  publishedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: publicCategorySelect },
} as const;

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

const articleStatusTransitionSelect = {
  id: true,
  status: true,
  publishedAt: true,
  archivedAt: true,
} as const;

@Injectable()
export class ArticlesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPublished(
    query: FindPublishedArticlesQuery,
  ): Promise<PublicArticleListResult> {
    const where: Prisma.ArticleWhereInput = {
      status: ArticleStatus.PUBLISHED,
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { summary: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.categorySlug
        ? { category: { is: { slug: query.categorySlug } } }
        : {}),
      ...(query.cefrLevel ? { cefrLevel: query.cefrLevel } : {}),
    };
    const direction = query.sort === 'oldest' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ publishedAt: direction }, { id: 'asc' }],
        select: publicArticleCardSelect,
      }),
      this.prisma.article.count({ where }),
    ]);

    return { items, total };
  }

  async findPublishedBySlug(
    slug: string,
  ): Promise<PublicArticleDetailRecord | null> {
    const result = await this.prisma.article.findFirst({
      where: { slug, status: ArticleStatus.PUBLISHED },
      select: {
        ...publicArticleMetadataSelect,
        category: { select: publicCategorySelect },
      },
    });

    if (!result) {
      return null;
    }

    const { category, ...article } = result;
    return { article, category };
  }

  async findAdminArticles(
    query: AdminArticleListQuery,
  ): Promise<AdminArticleListResult> {
    const where: Prisma.ArticleWhereInput = {
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { summary: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.cefrLevel ? { cefrLevel: query.cefrLevel } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const direction = query.sort === 'oldest' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: direction }, { id: 'asc' }],
        select: adminArticleListSelect,
      }),
      this.prisma.article.count({ where }),
    ]);

    return { items, total };
  }

  async findAdminArticleDetail(
    articleId: string,
  ): Promise<AdminArticleDetailRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: adminArticleSelect,
      });

      if (!article) return null;

      const currentSentenceWhere = {
        articleId,
        contentVersion: article.contentVersion,
        isActive: true,
      } as const;
      const sentenceCount = await tx.articleSentence.count({
        where: currentSentenceWhere,
      });
      const termCount = await tx.articleSentenceTerm.count({
        where: {
          isActive: true,
          sentence: { is: currentSentenceWhere },
        },
      });
      return { article, sentenceCount, termCount };
    });
  }

  async findPublicationSnapshot(
    articleId: string,
  ): Promise<ArticlePublicationSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          categoryId: true,
          title: true,
          slug: true,
          summary: true,
          contentHtml: true,
          contentVersion: true,
          sourceName: true,
          sourceUrl: true,
          authorName: true,
          thumbnailUrl: true,
          cefrLevel: true,
          status: true,
          publishedAt: true,
          archivedAt: true,
          category: {
            select: {
              ...publicCategorySelect,
              isActive: true,
            },
          },
        },
      });
      if (!article) return null;

      const sentences = await tx.articleSentence.findMany({
        where: {
          articleId,
          contentVersion: article.contentVersion,
        },
        orderBy: [{ sentenceOrder: 'asc' }, { id: 'asc' }],
        select: {
          ...articleSentenceSelect,
          terms: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: articleSentenceTermSelect,
          },
        },
      });
      return { article, sentences };
    });
  }

  create(input: CreateArticleInput): Promise<AdminArticleRecord> {
    return this.prisma.article.create({
      data: {
        ...input,
        status: ArticleStatus.DRAFT,
        aiAnalysisStatus: AiGenerationStatus.PENDING,
        aiAnalysisError: null,
        contentVersion: 1,
        publishedAt: null,
        archivedAt: null,
      },
      select: adminArticleSelect,
    });
  }

  findImportedDuplicate(
    lookup: ImportedArticleDuplicateLookup,
  ): Promise<ImportedArticleDuplicateRecord | null> {
    const where: Prisma.ArticleWhereInput = lookup.contentHash
      ? { contentHash: lookup.contentHash }
      : lookup.canonicalUrl
        ? { canonicalUrl: lookup.canonicalUrl }
        : {
            importSource: lookup.importSource,
            externalId: lookup.externalId,
          };

    return this.prisma.article.findFirst({
      where,
      select: { id: true },
    });
  }

  createImported(
    input: CreateImportedArticleInput,
  ): Promise<AdminArticleRecord> {
    return this.prisma.article.create({
      data: {
        ...input,
        status: ArticleStatus.DRAFT,
        contentVersion: 1,
        publishedAt: null,
        archivedAt: null,
      },
      select: adminArticleSelect,
    });
  }

  findMutationState(articleId: string): Promise<ArticleMutationState | null> {
    return this.prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        status: true,
        contentHtml: true,
        contentVersion: true,
      },
    });
  }

  async transitionArticleStatus(
    input: ArticleStatusTransitionInput,
  ): Promise<ArticleStatusTransitionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.article.updateMany({
        where: {
          id: input.articleId,
          status: input.expectedStatus,
          contentVersion: input.expectedContentVersion,
          contentHtml: input.expectedContentHtml,
          ...(input.requireActiveCategory
            ? { category: { is: { isActive: true } } }
            : {}),
        },
        data: {
          status: input.status,
          ...(input.publishedAt === undefined
            ? {}
            : { publishedAt: input.publishedAt }),
          ...(input.archivedAt === undefined
            ? {}
            : { archivedAt: input.archivedAt }),
          updatedByUserId: input.updatedByUserId,
        },
      });
      if (updated.count !== 1) {
        throw new ArticleStatusTransitionConflictError();
      }
      const article = await tx.article.findUnique({
        where: { id: input.articleId },
        select: articleStatusTransitionSelect,
      });
      if (!article) throw new ArticleStatusTransitionConflictError();
      return article;
    });
  }

  update(
    articleId: string,
    input: UpdateArticleInput,
  ): Promise<AdminArticleRecord> {
    return this.prisma.article.update({
      where: { id: articleId },
      data: input,
      select: adminArticleSelect,
    });
  }

  updateContent(
    articleId: string,
    previousContentVersion: number,
    input: UpdateArticleInput & { contentHtml: string },
    resetAiAnalysis = false,
  ): Promise<AdminArticleRecord> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.update({
        where: { id: articleId },
        data: {
          ...input,
          contentVersion: { increment: 1 },
          ...(resetAiAnalysis
            ? {
                aiAnalysisStatus: AiGenerationStatus.PENDING,
                aiAnalysisError: null,
              }
            : {}),
        },
        select: adminArticleSelect,
      });

      await tx.articleSentence.updateMany({
        where: {
          articleId,
          contentVersion: previousContentVersion,
          isActive: true,
        },
        data: { isActive: false, updatedByUserId: input.updatedByUserId },
      });

      return article;
    });
  }

  async findDeleteSafety(
    articleId: string,
  ): Promise<ArticleDeleteSafetyRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUnique({
        where: { id: articleId },
        select: { id: true, status: true },
      });

      if (!article) return null;

      const termRelation = {
        articleSentenceTerm: {
          is: { sentence: { is: { articleId } } },
        },
      } as const;
      const readingProgressCount = await tx.userArticleProgress.count({
        where: { articleId },
      });
      const savedVocabularyCount = await tx.userVocabulary.count({
        where: termRelation,
      });
      const reviewAnswerCount = await tx.reviewAnswer.count({
        where: {
          reviewSessionItem: {
            is: {
              reviewQuestion: {
                is: {
                  articleSentenceTerm: {
                    is: { sentence: { is: { articleId } } },
                  },
                },
              },
            },
          },
        },
      });

      return {
        ...article,
        readingProgressCount,
        savedVocabularyCount,
        reviewAnswerCount,
      };
    });
  }

  async delete(articleId: string): Promise<void> {
    await this.prisma.article.delete({
      where: { id: articleId },
      select: { id: true },
    });
  }
}
