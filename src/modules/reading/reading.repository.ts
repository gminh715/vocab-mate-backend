import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  AiGenerationStatus,
  ArticleStatus,
  type CefrLevel,
  type LearningStatus,
  type LexicalUnitType,
  ReadingStatus,
  TermReviewStatus,
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
  termCandidates: Array<{ id: string; cefrLevel: CefrLevel | null }>;
  progress: ReaderProgressRecord | null;
}

export interface ContextualTermRecord {
  id: string;
  value: string;
  wordDisplay: string | null;
  lemma: string;
  unitType: LexicalUnitType;
  partOfSpeech: string | null;
  ipa: string | null;
  cefrLevel: CefrLevel | null;
  contextualMeaningVi: string | null;
  definitionEn: string | null;
  contextualExplanation: string | null;
  explanationStatus: AiGenerationStatus;
  explanationGeneratedAt: Date | null;
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

export interface ContextualTermEnrichmentClaimRecord {
  article: {
    id: string;
    title: string;
    contentVersion: number;
  };
  term: {
    id: string;
    value: string;
    lemma: string;
    unitType: LexicalUnitType;
  };
  parentSentence: {
    id: string;
    sentenceOrder: number;
    sentenceText: string;
  };
  neighboringSentences: Array<{
    id: string;
    sentenceOrder: number;
    sentenceText: string;
  }>;
}

export interface ContextualTermEnrichmentData {
  wordDisplay: string;
  normalizedLemma: string;
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  contextualMeaningVi: string;
  definitionEn: string;
  contextualExplanation: string;
  ipa: string | null;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  vocabularyTopic: string | null;
  examples: Array<{
    sentence: string;
    translationVi: string;
  }>;
  sentenceTranslationVi: string;
}

export interface CompleteContextualTermEnrichmentInput {
  articleId: string;
  contentVersion: number;
  termId: string;
  parentSentenceId: string;
  generatedAt: Date;
  enrichment: ContextualTermEnrichmentData;
}

export class ContextualTermEnrichmentStateConflictError extends Error {
  constructor() {
    super('Contextual term enrichment state changed');
    this.name = ContextualTermEnrichmentStateConflictError.name;
  }
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
  explanationStatus: true,
  explanationGeneratedAt: true,
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
  explanationStatus: true,
  explanationGeneratedAt: true,
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

const hasNonEmptyText = (value: string | null): boolean =>
  Boolean(value?.trim());

const hasStoredExamples = (value: Prisma.JsonValue): boolean =>
  Array.isArray(value) && value.length > 0;

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
      const profile = await transaction.userProfile.findUnique({
        where: { userId },
        select: { currentCefrLevel: true },
      });
      const termCandidates = await transaction.articleSentenceTerm.findMany({
        where: {
          reviewStatus: TermReviewStatus.APPROVED,
          isActive: true,
          isLookupEnabled: true,
          sentence: { is: currentSentenceWhere },
        },
        orderBy: { id: 'asc' },
        select: { id: true, cefrLevel: true },
      });
      const progress = await transaction.userArticleProgress.findUnique({
        where: {
          userId_articleId: {
            userId,
            articleId: article.id,
          },
        },
        select: readerProgressSelect,
      });

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
          reviewStatus: TermReviewStatus.APPROVED,
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
        reviewStatus: TermReviewStatus.APPROVED,
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

  async claimContextualTermEnrichment(
    articleId: string,
    termId: string,
  ): Promise<ContextualTermEnrichmentClaimRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const article = await transaction.article.findFirst({
        where: publishedArticleIdWhere(articleId),
        select: { id: true, title: true, contentVersion: true },
      });
      if (!article) return null;

      const claimed = await transaction.articleSentenceTerm.updateMany({
        where: {
          id: termId,
          reviewStatus: TermReviewStatus.APPROVED,
          explanationStatus: {
            in: [AiGenerationStatus.PENDING, AiGenerationStatus.FAILED],
          },
          isActive: true,
          isLookupEnabled: true,
          sentence: {
            is: {
              articleId: article.id,
              contentVersion: article.contentVersion,
              isActive: true,
              article: {
                is: {
                  status: ArticleStatus.PUBLISHED,
                  contentVersion: article.contentVersion,
                },
              },
            },
          },
        },
        data: {
          explanationStatus: AiGenerationStatus.PROCESSING,
          explanationError: null,
          updatedAt: new Date(),
        },
      });
      if (claimed.count !== 1) return null;

      const result = await transaction.articleSentenceTerm.findFirst({
        where: {
          id: termId,
          explanationStatus: AiGenerationStatus.PROCESSING,
          sentence: {
            is: {
              articleId: article.id,
              contentVersion: article.contentVersion,
              isActive: true,
            },
          },
        },
        select: {
          id: true,
          value: true,
          lemma: true,
          unitType: true,
          sentence: {
            select: {
              id: true,
              sentenceOrder: true,
              sentenceText: true,
            },
          },
        },
      });
      if (!result) {
        throw new ContextualTermEnrichmentStateConflictError();
      }

      const neighboringSentences = await transaction.articleSentence.findMany({
        where: {
          articleId: article.id,
          contentVersion: article.contentVersion,
          isActive: true,
          sentenceOrder: {
            gte: Math.max(1, result.sentence.sentenceOrder - 2),
            lte: result.sentence.sentenceOrder + 2,
          },
        },
        orderBy: [{ sentenceOrder: 'asc' }, { id: 'asc' }],
        take: 5,
        select: {
          id: true,
          sentenceOrder: true,
          sentenceText: true,
        },
      });
      const { sentence, ...term } = result;

      return {
        article,
        term,
        parentSentence: sentence,
        neighboringSentences,
      };
    });
  }

  async completeContextualTermEnrichment(
    input: CompleteContextualTermEnrichmentInput,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const current = await transaction.articleSentenceTerm.findFirst({
            where: {
              id: input.termId,
              reviewStatus: TermReviewStatus.APPROVED,
              explanationStatus: AiGenerationStatus.PROCESSING,
              isActive: true,
              isLookupEnabled: true,
              sentence: {
                is: {
                  id: input.parentSentenceId,
                  articleId: input.articleId,
                  contentVersion: input.contentVersion,
                  isActive: true,
                  article: {
                    is: {
                      status: ArticleStatus.PUBLISHED,
                      contentVersion: input.contentVersion,
                    },
                  },
                },
              },
            },
            select: {
              wordDisplay: true,
              normalizedLemma: true,
              partOfSpeech: true,
              cefrLevel: true,
              contextualMeaningVi: true,
              definitionEn: true,
              contextualExplanation: true,
              ipa: true,
              synonyms: true,
              antonyms: true,
              collocations: true,
              relatedTerms: true,
              vocabularyTopic: true,
              examples: true,
              sentence: {
                select: {
                  translationVi: true,
                },
              },
            },
          });
          if (!current) {
            throw new ContextualTermEnrichmentStateConflictError();
          }

          if (!hasNonEmptyText(current.sentence.translationVi)) {
            await transaction.articleSentence.updateMany({
              where: {
                id: input.parentSentenceId,
                articleId: input.articleId,
                contentVersion: input.contentVersion,
                isActive: true,
                translationVi: current.sentence.translationVi,
              },
              data: {
                translationVi: input.enrichment.sentenceTranslationVi,
                updatedAt: input.generatedAt,
              },
            });
          }

          const updated = await transaction.articleSentenceTerm.updateMany({
            where: {
              id: input.termId,
              reviewStatus: TermReviewStatus.APPROVED,
              explanationStatus: AiGenerationStatus.PROCESSING,
              isActive: true,
              isLookupEnabled: true,
              sentence: {
                is: {
                  id: input.parentSentenceId,
                  articleId: input.articleId,
                  contentVersion: input.contentVersion,
                  isActive: true,
                  article: {
                    is: {
                      status: ArticleStatus.PUBLISHED,
                      contentVersion: input.contentVersion,
                    },
                  },
                },
              },
            },
            data: {
              ...(hasNonEmptyText(current.wordDisplay)
                ? {}
                : { wordDisplay: input.enrichment.wordDisplay }),
              ...(hasNonEmptyText(current.normalizedLemma)
                ? {}
                : { normalizedLemma: input.enrichment.normalizedLemma }),
              ...(hasNonEmptyText(current.partOfSpeech)
                ? {}
                : { partOfSpeech: input.enrichment.partOfSpeech }),
              ...(current.cefrLevel
                ? {}
                : { cefrLevel: input.enrichment.cefrLevel }),
              ...(hasNonEmptyText(current.contextualMeaningVi)
                ? {}
                : {
                    contextualMeaningVi: input.enrichment.contextualMeaningVi,
                  }),
              ...(hasNonEmptyText(current.definitionEn)
                ? {}
                : { definitionEn: input.enrichment.definitionEn }),
              ...(hasNonEmptyText(current.contextualExplanation)
                ? {}
                : {
                    contextualExplanation:
                      input.enrichment.contextualExplanation,
                  }),
              ...(hasNonEmptyText(current.ipa) || !input.enrichment.ipa
                ? {}
                : { ipa: input.enrichment.ipa }),
              ...(current.synonyms.length > 0
                ? {}
                : { synonyms: input.enrichment.synonyms }),
              ...(current.antonyms.length > 0
                ? {}
                : { antonyms: input.enrichment.antonyms }),
              ...(current.collocations.length > 0
                ? {}
                : { collocations: input.enrichment.collocations }),
              ...(current.relatedTerms.length > 0
                ? {}
                : { relatedTerms: input.enrichment.relatedTerms }),
              ...(hasNonEmptyText(current.vocabularyTopic) ||
              !input.enrichment.vocabularyTopic
                ? {}
                : { vocabularyTopic: input.enrichment.vocabularyTopic }),
              ...(hasStoredExamples(current.examples)
                ? {}
                : { examples: input.enrichment.examples }),
              explanationStatus: AiGenerationStatus.READY,
              explanationError: null,
              explanationGeneratedAt: input.generatedAt,
              updatedAt: input.generatedAt,
            },
          });
          if (updated.count !== 1) {
            throw new ContextualTermEnrichmentStateConflictError();
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (isTransactionConflictError(error)) {
        throw new ContextualTermEnrichmentStateConflictError();
      }
      throw error;
    }
  }

  async failContextualTermEnrichment(
    articleId: string,
    contentVersion: number,
    termId: string,
    explanationError: string,
  ): Promise<boolean> {
    const failed = await this.prisma.articleSentenceTerm.updateMany({
      where: {
        id: termId,
        reviewStatus: TermReviewStatus.APPROVED,
        explanationStatus: AiGenerationStatus.PROCESSING,
        isActive: true,
        isLookupEnabled: true,
        sentence: {
          is: {
            articleId,
            contentVersion,
          },
        },
      },
      data: {
        explanationStatus: AiGenerationStatus.FAILED,
        explanationError: explanationError.slice(0, 500),
        updatedAt: new Date(),
      },
    });
    return failed.count === 1;
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
