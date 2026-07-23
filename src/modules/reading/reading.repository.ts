import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  ArticleStatus,
  type CefrLevel,
  type LearningStatus,
  type LexicalUnitType,
  ReadingStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';

export interface ReaderArticleMetadataRecord {
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
  category: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface ReaderProgressRecord {
  articleId: string;
  status: ReadingStatus;
  progressPercent: Prisma.Decimal | null;
  lastBlockKey: string | null;
  completedAt: Date | null;
}

export interface ReadingHistoryQuery {
  page: number;
  limit: number;
  status?: ReadingStatus;
  sort: 'newest' | 'oldest';
}

export interface ReadingHistoryRecord extends ReaderProgressRecord {
  firstOpenedAt: Date;
  lastReadAt: Date;
  article: {
    id: string;
    title: string;
    slug: string;
    summary: string;
    thumbnailUrl: string | null;
    cefrLevel: CefrLevel;
    status: ArticleStatus;
    publishedAt: Date | null;
    category: {
      id: string;
      name: string;
      slug: string;
    };
  };
}

export interface ReadingHistoryResult {
  items: ReadingHistoryRecord[];
  total: number;
}

export interface UserArticleProgressResult {
  articleId: string;
  progress: ReaderProgressRecord | null;
}

export interface UpsertUserArticleProgressInput {
  progressPercent?: number;
  lastBlockKey?: string;
}

export class ReadingProgressMutationConflictError extends Error {
  constructor() {
    super('Concurrent reading progress update');
    this.name = ReadingProgressMutationConflictError.name;
  }
}

export interface ReaderArticleRecord {
  article: ReaderArticleMetadataRecord;
  contentHtml: string;
  userCefrLevel: CefrLevel | null;
  termCandidates: Array<{ id: string; cefrLevel: CefrLevel }>;
  progress: ReaderProgressRecord | null;
}

export interface ContextualTermRecord {
  id: string;
  value: string;
  wordDisplay: string;
  lemma: string;
  unitType: LexicalUnitType;
  partOfSpeech: string;
  ipa: string | null;
  cefrLevel: CefrLevel;
  contextualMeaningVi: string;
  definitionEn: string | null;
  contextualExplanation: string | null;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  vocabularyTopic: string | null;
  examples: Prisma.JsonValue;
  skill: string | null;
}

export interface ContextualParentSentenceRecord {
  id: string;
  sentenceOrder: number;
  sentenceText: string;
  translationVi: string | null;
  explanationVi: string | null;
  referenceExplanation: string | null;
  skill: string | null;
}

export interface ContextualSaveRecord {
  id: string;
  learningStatus: LearningStatus;
}

export interface ContextualTermLookupRecord {
  term: ContextualTermRecord;
  parentSentence: ContextualParentSentenceRecord;
  isLookupEnabled: boolean;
  save: ContextualSaveRecord | null;
}

export interface SavableContextualTermRecord {
  term: ContextualTermRecord;
  parentSentence: ContextualParentSentenceRecord & {
    contentVersion: number;
  };
  sourceArticle: {
    id: string;
    contentVersion: number;
  };
  isLookupEnabled: boolean;
}

const readerArticleSelect = {
  id: true,
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
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} as const;

const readerProgressSelect = {
  articleId: true,
  status: true,
  progressPercent: true,
  lastBlockKey: true,
  completedAt: true,
} as const;

const historyArticleSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  thumbnailUrl: true,
  cefrLevel: true,
  status: true,
  publishedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} as const;

const historyProgressSelect = {
  ...readerProgressSelect,
  firstOpenedAt: true,
  lastReadAt: true,
  article: { select: historyArticleSelect },
} as const;

const publishedArticleIdWhere = (articleId: string) =>
  ({ id: articleId, status: ArticleStatus.PUBLISHED }) as const;

const contextualParentSentenceSelect = {
  id: true,
  sentenceOrder: true,
  sentenceText: true,
  translationVi: true,
  explanationVi: true,
  referenceExplanation: true,
  skill: true,
} as const;

const contextualTermSelect = {
  id: true,
  value: true,
  wordDisplay: true,
  lemma: true,
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
  isLookupEnabled: true,
  sentence: { select: contextualParentSentenceSelect },
} as const;

const savableContextualTermSelect = {
  id: true,
  value: true,
  wordDisplay: true,
  lemma: true,
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
  isLookupEnabled: true,
  sentence: {
    select: {
      ...contextualParentSentenceSelect,
      contentVersion: true,
      article: {
        select: {
          id: true,
          contentVersion: true,
        },
      },
    },
  },
} as const;

const SERIALIZABLE_RETRY_LIMIT = 3;

const isTransactionConflictError = (
  error: unknown,
): error is { code: 'P2034' } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2034';

@Injectable()
export class ReadingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findReaderArticle(
    userId: string,
    slug: string,
  ): Promise<ReaderArticleRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.article.findFirst({
        where: { slug, status: ArticleStatus.PUBLISHED },
        select: readerArticleSelect,
      });
      if (!result) return null;

      const { contentHtml, contentVersion, ...article } = result;
      const currentSentenceWhere = {
        articleId: article.id,
        contentVersion,
        isActive: true,
      } as const;
      const [profile, termCandidates, progress] = await Promise.all([
        transaction.userProfile.findUnique({
          where: { userId },
          select: { currentCefrLevel: true },
        }),
        transaction.articleSentenceTerm.findMany({
          where: {
            isActive: true,
            isLookupEnabled: true,
            sentence: { is: currentSentenceWhere },
          },
          orderBy: { id: 'asc' },
          select: { id: true, cefrLevel: true },
        }),
        transaction.userArticleProgress.findUnique({
          where: {
            userId_articleId: {
              userId,
              articleId: article.id,
            },
          },
          select: readerProgressSelect,
        }),
      ]);

      return {
        article,
        contentHtml,
        userCefrLevel: profile?.currentCefrLevel ?? null,
        termCandidates,
        progress,
      };
    });
  }

  async findContextualTerm(
    userId: string,
    articleId: string,
    termId: string,
  ): Promise<ContextualTermLookupRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const article = await transaction.article.findFirst({
        where: publishedArticleIdWhere(articleId),
        select: { id: true, contentVersion: true },
      });
      if (!article) return null;

      const result = await transaction.articleSentenceTerm.findFirst({
        where: {
          id: termId,
          isActive: true,
          sentence: {
            is: {
              articleId: article.id,
              contentVersion: article.contentVersion,
              isActive: true,
            },
          },
        },
        select: contextualTermSelect,
      });
      if (!result) return null;

      const { sentence, isLookupEnabled, ...term } = result;
      const save = isLookupEnabled
        ? await transaction.userVocabulary.findUnique({
            where: {
              userId_articleSentenceTermId: {
                userId,
                articleSentenceTermId: termId,
              },
            },
            select: { id: true, learningStatus: true },
          })
        : null;

      return {
        term,
        parentSentence: sentence,
        isLookupEnabled,
        save,
      };
    });
  }

  async findContextualTermForSave(
    termId: string,
  ): Promise<SavableContextualTermRecord | null> {
    const result = await this.prisma.articleSentenceTerm.findFirst({
      where: {
        id: termId,
        isActive: true,
        sentence: {
          is: {
            isActive: true,
            article: {
              is: {
                status: ArticleStatus.PUBLISHED,
              },
            },
          },
        },
      },
      select: savableContextualTermSelect,
    });
    if (!result) return null;

    const {
      sentence: { article, ...parentSentence },
      isLookupEnabled,
      ...term
    } = result;

    return {
      term,
      parentSentence,
      sourceArticle: article,
      isLookupEnabled,
    };
  }

  async listUserHistory(
    userId: string,
    query: ReadingHistoryQuery,
  ): Promise<ReadingHistoryResult> {
    const where: Prisma.UserArticleProgressWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const direction = query.sort === 'oldest' ? 'asc' : 'desc';
    const [items, total] = await this.prisma.$transaction([
      this.prisma.userArticleProgress.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ lastReadAt: direction }, { id: 'asc' }],
        select: historyProgressSelect,
      }),
      this.prisma.userArticleProgress.count({ where }),
    ]);

    return { items, total };
  }

  async findUserArticleProgress(
    userId: string,
    articleId: string,
  ): Promise<UserArticleProgressResult | null> {
    const article = await this.prisma.article.findFirst({
      where: publishedArticleIdWhere(articleId),
      select: {
        id: true,
        readerProgress: {
          where: { userId },
          take: 1,
          select: readerProgressSelect,
        },
      },
    });
    if (!article) return null;

    return {
      articleId: article.id,
      progress: article.readerProgress[0] ?? null,
    };
  }

  upsertUserArticleProgress(
    userId: string,
    articleId: string,
    input: UpsertUserArticleProgressInput,
  ): Promise<UserArticleProgressResult | null> {
    return this.runSerializableProgressMutation(async (transaction) => {
      const article = await transaction.article.findFirst({
        where: publishedArticleIdWhere(articleId),
        select: { id: true },
      });
      if (!article) return null;

      const existing = await transaction.userArticleProgress.findUnique({
        where: { userId_articleId: { userId, articleId } },
        select: { status: true, completedAt: true },
      });
      const now = new Date();
      const isCompleted = existing?.status === ReadingStatus.COMPLETED;
      const progress = await transaction.userArticleProgress.upsert({
        where: { userId_articleId: { userId, articleId } },
        create: {
          userId,
          articleId,
          status: ReadingStatus.READING,
          progressPercent: input.progressPercent ?? 0,
          ...(input.lastBlockKey === undefined
            ? {}
            : { lastBlockKey: input.lastBlockKey }),
          firstOpenedAt: now,
          lastReadAt: now,
          completedAt: null,
        },
        update: {
          status: isCompleted ? ReadingStatus.COMPLETED : ReadingStatus.READING,
          completedAt: isCompleted ? (existing.completedAt ?? now) : null,
          lastReadAt: now,
          ...(isCompleted
            ? { progressPercent: 100 }
            : input.progressPercent === undefined
              ? {}
              : { progressPercent: input.progressPercent }),
          ...(input.lastBlockKey === undefined
            ? {}
            : { lastBlockKey: input.lastBlockKey }),
        },
        select: readerProgressSelect,
      });

      return { articleId: article.id, progress };
    });
  }

  completeUserArticleProgress(
    userId: string,
    articleId: string,
  ): Promise<UserArticleProgressResult | null> {
    return this.runSerializableProgressMutation(async (transaction) => {
      const article = await transaction.article.findFirst({
        where: publishedArticleIdWhere(articleId),
        select: { id: true },
      });
      if (!article) return null;

      const existing = await transaction.userArticleProgress.findUnique({
        where: { userId_articleId: { userId, articleId } },
        select: { completedAt: true },
      });
      const now = new Date();
      const completedAt = existing?.completedAt ?? now;
      const progress = await transaction.userArticleProgress.upsert({
        where: { userId_articleId: { userId, articleId } },
        create: {
          userId,
          articleId,
          status: ReadingStatus.COMPLETED,
          progressPercent: 100,
          firstOpenedAt: now,
          lastReadAt: now,
          completedAt,
        },
        update: {
          status: ReadingStatus.COMPLETED,
          progressPercent: 100,
          lastReadAt: now,
          completedAt,
        },
        select: readerProgressSelect,
      });

      return { articleId: article.id, progress };
    });
  }

  async deleteUserArticleProgress(
    userId: string,
    articleId: string,
  ): Promise<boolean> {
    const result = await this.prisma.userArticleProgress.deleteMany({
      where: { userId, articleId },
    });
    return result.count === 1;
  }

  private async runSerializableProgressMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!isTransactionConflictError(error)) throw error;
        if (attempt === SERIALIZABLE_RETRY_LIMIT) {
          throw new ReadingProgressMutationConflictError();
        }
      }
    }

    throw new ReadingProgressMutationConflictError();
  }
}
