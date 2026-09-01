import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  AiGenerationStatus,
  ArticleStatus,
  type CefrLevel,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';

export interface ContextualTermRecord {
  id: string;
  value: string;
  lemma: string;
  partOfSpeech: string | null;
  ipa: string | null;
  cefrLevel: CefrLevel | null;
  contextualMeaningVi: string | null;
  definitionEn: string | null;
  contextualExplanation: string | null;
  explanationStatus: AiGenerationStatus;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  examples: Prisma.JsonValue;
}

export interface ContextualParentSentenceRecord {
  id: string;
  sentenceOrder: number;
  sentenceText: string;
  translationVi: string | null;
}

export interface ContextualSaveRecord {
  id: string;
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

const publishedArticleIdWhere = (articleId: string) =>
  ({ id: articleId, status: ArticleStatus.PUBLISHED }) as const;

const contextualParentSentenceSelect = {
  id: true,
  sentenceOrder: true,
  sentenceText: true,
  translationVi: true,
} as const;

const contextualTermSelect = {
  id: true,
  value: true,
  lemma: true,
  partOfSpeech: true,
  ipa: true,
  cefrLevel: true,
  contextualMeaningVi: true,
  definitionEn: true,
  contextualExplanation: true,
  explanationStatus: true,
  synonyms: true,
  antonyms: true,
  collocations: true,
  relatedTerms: true,
  examples: true,
  isLookupEnabled: true,
  sentence: { select: contextualParentSentenceSelect },
} as const;

const savableContextualTermSelect = {
  id: true,
  value: true,
  lemma: true,
  partOfSpeech: true,
  ipa: true,
  cefrLevel: true,
  contextualMeaningVi: true,
  definitionEn: true,
  contextualExplanation: true,
  explanationStatus: true,
  synonyms: true,
  antonyms: true,
  collocations: true,
  relatedTerms: true,
  examples: true,
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
export class ContextualTermsRepository {
  constructor(private readonly prisma: PrismaService) {}

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
            select: { id: true },
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
              ...(hasStoredExamples(current.examples)
                ? {}
                : { examples: input.enrichment.examples }),
              explanationStatus: AiGenerationStatus.READY,
              explanationError: null,
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
}
