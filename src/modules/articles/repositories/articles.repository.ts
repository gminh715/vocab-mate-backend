import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  AiGenerationStatus,
  ArticleStatus,
  type CefrLevel,
  LexicalUnitType,
  QuizStatus,
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
  quizCount: number;
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
  quizCount: number;
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
  quizCount: number;
  reviewSessionCount: number;
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
          term.unitType === expectedTerm.unitType &&
          term.updatedAt.getTime() === expectedTerm.updatedAt.getTime()
        );
      })
    );
  });

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
        _count: {
          select: {
            quizzes: { where: { status: QuizStatus.PUBLISHED } },
          },
        },
      },
    });

    if (!result) {
      return null;
    }

    const { category, _count, ...article } = result;
    return { article, category, quizCount: _count.quizzes };
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
      const quizCount = await tx.quiz.count({ where: { articleId } });

      return { article, sentenceCount, termCount, quizCount };
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
              unitType: true,
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
    actingAdminId: string,
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
        updatedByUserId: actingAdminId,
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
            updatedByUserId: input.actingAdminId,
            aiAnalysisStatus: AiGenerationStatus.READY,
            aiAnalysisError: null,
          },
        });
        if (updated.count !== 1) {
          throw new ArticleAnalysisStateConflictError();
        }

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
                unitType: true,
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
              wordDisplay: null,
              normalizedLemma: null,
              unitType: LexicalUnitType.WORD,
              partOfSpeech: null,
              cefrLevel: null,
              origin: TermOrigin.NLP,
              reviewStatus: TermReviewStatus.APPROVED,
              explanationStatus: AiGenerationStatus.PENDING,
              selectionReason: null,
              contextualMeaningVi: null,
              definitionEn: null,
              contextualExplanation: null,
              ipa: null,
              synonyms: [],
              antonyms: [],
              collocations: [],
              relatedTerms: [],
              vocabularyTopic: null,
              examples: [],
              skill: null,
              explanationError: null,
              explanationGeneratedAt: null,
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
      if (currentSentenceCount !== 1) {
        throw new ArticleTermStateConflictError();
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
      if (articleUpdate.count !== 1) {
        throw new ArticleTermStateConflictError();
      }
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
      if (currentSentenceCount !== 1) {
        throw new ArticleTermStateConflictError();
      }

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
      if (articleUpdate.count !== 1) {
        throw new ArticleTermStateConflictError();
      }

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
      if (termUpdate.count !== 1) {
        throw new ArticleTermStateConflictError();
      }

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
              article: {
                is: {
                  contentVersion,
                  status: ArticleStatus.DRAFT,
                },
              },
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
      if (updated.count !== 1) {
        throw new ArticleTermStateConflictError();
      }

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
                {
                  normalizedLemma: {
                    contains: query.q,
                    mode: 'insensitive',
                  },
                },
                {
                  partOfSpeech: {
                    contains: query.q,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
        sentence: {
          is: {
            articleId,
            contentVersion: article.contentVersion,
          },
        },
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
                is: {
                  contentVersion,
                  status: { not: ArticleStatus.ARCHIVED },
                },
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
      if (currentSentenceCount !== 1) {
        throw new ArticleTermStateConflictError();
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
      if (articleUpdate.count !== 1) {
        throw new ArticleTermStateConflictError();
      }
      const updated = await tx.articleSentenceTerm.updateMany({
        where: {
          id: marker.termId,
          sentenceId: marker.sentenceId,
        },
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
      if (currentTermCount !== 1) {
        throw new ArticleTermStateConflictError();
      }
      const referenceWhere = { articleSentenceTermId: marker.termId } as const;
      const savedVocabularyCount = await tx.userVocabulary.count({
        where: referenceWhere,
      });
      const quizQuestionCount = await tx.quizQuestion.count({
        where: { articleVocabularyId: marker.termId },
      });
      const reviewAnswerCount = await tx.reviewAnswer.count({
        where: { articleVocabularyId: marker.termId },
      });
      if (
        savedVocabularyCount > 0 ||
        quizQuestionCount > 0 ||
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
      if (articleUpdate.count !== 1) {
        throw new ArticleTermStateConflictError();
      }
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
      const quizCount = await tx.quiz.count({ where: { articleId } });
      const reviewSessionCount = await tx.reviewSession.count({
        where: { articleId },
      });
      const reviewAnswerCount = await tx.reviewAnswer.count({
        where: {
          articleVocabulary: {
            is: { sentence: { is: { articleId } } },
          },
        },
      });

      return {
        ...article,
        readingProgressCount,
        savedVocabularyCount,
        quizCount,
        reviewSessionCount,
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
