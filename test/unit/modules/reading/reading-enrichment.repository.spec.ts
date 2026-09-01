import { Prisma } from '../../../../generated/prisma/client';
import {
  AiGenerationStatus,
  ArticleStatus,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import type { PrismaService } from '../../../../src/database/prisma.service';
import {
  ContextualTermEnrichmentStateConflictError,
  ContextualTermsRepository,
} from '../../../../src/modules/reading/repositories/contextual-terms.repository';

interface UpdateManyArgs {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}

interface FindManyArgs {
  where: Record<string, unknown>;
  take?: number;
}

type UpdateManyMock = jest.MockedFunction<
  (args: UpdateManyArgs) => Promise<{ count: number }>
>;

type FindManyMock = jest.MockedFunction<
  (args: FindManyArgs) => Promise<unknown[]>
>;

type TransactionCallback = (client: unknown) => Promise<unknown>;
type TransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel;
};
type TransactionMock = jest.MockedFunction<
  (
    callback: TransactionCallback,
    options?: TransactionOptions,
  ) => Promise<unknown>
>;

const enrichment = {
  partOfSpeech: 'adjective',
  cefrLevel: 'B1' as const,
  contextualMeaningVi: 'có hại',
  definitionEn: 'causing damage',
  contextualExplanation: 'It describes a damaging effect.',
  ipa: '/ˈhɑːrmfəl/',
  synonyms: ['damaging'],
  antonyms: ['beneficial'],
  collocations: ['harmful effect'],
  relatedTerms: ['harm'],
  examples: [
    {
      sentence: 'Smoke is harmful to health.',
      translationVi: 'Khói có hại cho sức khỏe.',
    },
  ],
  sentenceTranslationVi: 'Rác thải nhựa có hại.',
};

describe('ContextualTermsRepository enrichment', () => {
  it('atomically claims the exact pending term and returns a five-sentence maximum context', async () => {
    const articleFindFirst = jest.fn().mockResolvedValue({
      id: 'article-id',
      title: 'Plastic Waste',
      contentVersion: 4,
    });
    const termUpdateMany: UpdateManyMock = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const termFindFirst = jest.fn().mockResolvedValue({
      id: 'term-id',
      value: 'harmful',
      lemma: 'harmful',
      partOfSpeech: 'adjective',
      cefrLevel: 'B1',
      sentence: {
        id: 'sentence-id',
        sentenceOrder: 7,
        sentenceText: 'Plastic waste is harmful.',
      },
    });
    const sentenceFindMany: FindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'sentence-id',
        sentenceOrder: 7,
        sentenceText: 'Plastic waste is harmful.',
      },
    ]);
    const transaction: TransactionMock = jest.fn(
      (callback: (client: unknown) => Promise<unknown>) =>
        callback({
          article: { findFirst: articleFindFirst },
          articleSentenceTerm: {
            updateMany: termUpdateMany,
            findFirst: termFindFirst,
          },
          articleSentence: { findMany: sentenceFindMany },
        }),
    );
    const repository = new ContextualTermsRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      repository.claimContextualTermEnrichment('article-id', 'term-id'),
    ).resolves.toMatchObject({
      article: { id: 'article-id', contentVersion: 4 },
      term: { id: 'term-id', value: 'harmful', lemma: 'harmful' },
      parentSentence: { id: 'sentence-id' },
    });

    const claimArgs = termUpdateMany.mock.calls[0][0];
    expect(claimArgs.where).toEqual({
      id: 'term-id',
      reviewStatus: TermReviewStatus.APPROVED,
      explanationStatus: {
        in: [AiGenerationStatus.PENDING, AiGenerationStatus.FAILED],
      },
      isActive: true,
      isLookupEnabled: true,
      sentence: {
        is: {
          articleId: 'article-id',
          contentVersion: 4,
          isActive: true,
          article: {
            is: {
              status: ArticleStatus.PUBLISHED,
              contentVersion: 4,
            },
          },
        },
      },
    });
    expect(claimArgs.data).toMatchObject({
      explanationStatus: AiGenerationStatus.PROCESSING,
      explanationError: null,
    });
    expect(claimArgs.where).not.toHaveProperty('origin');
    expect(claimArgs.data.updatedAt).toBeInstanceOf(Date);
    const contextArgs = sentenceFindMany.mock.calls[0][0];
    expect(contextArgs.where).toMatchObject({
      articleId: 'article-id',
      contentVersion: 4,
      sentenceOrder: { gte: 5, lte: 9 },
    });
    expect(contextArgs.take).toBe(5);
  });

  it('returns a lost claim without loading context', async () => {
    const termFindFirst = jest.fn();
    const transaction = jest.fn(
      (callback: (client: unknown) => Promise<unknown>) =>
        callback({
          article: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'article-id',
              title: 'Article',
              contentVersion: 1,
            }),
          },
          articleSentenceTerm: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            findFirst: termFindFirst,
          },
        }),
    );
    const repository = new ContextualTermsRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      repository.claimContextualTermEnrichment('article-id', 'term-id'),
    ).resolves.toBeNull();
    expect(termFindFirst).not.toHaveBeenCalled();
  });

  it('fills only missing fields, preserves manual values, and marks the exact term READY', async () => {
    const sentenceUpdateMany: UpdateManyMock = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const termUpdateMany: UpdateManyMock = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const transaction: TransactionMock = jest.fn(
      (callback: (client: unknown) => Promise<unknown>) =>
        callback({
          articleSentenceTerm: {
            findFirst: jest.fn().mockResolvedValue({
              contextualMeaningVi: 'nghĩa thủ công',
              partOfSpeech: null,
              cefrLevel: null,
              definitionEn: null,
              contextualExplanation: null,
              ipa: '/manual/',
              synonyms: ['manual synonym'],
              antonyms: [],
              collocations: [],
              relatedTerms: [],
              examples: [
                {
                  sentence: 'Manual example.',
                  translationVi: 'Ví dụ thủ công.',
                },
              ],
              sentence: { translationVi: null },
            }),
            updateMany: termUpdateMany,
          },
          articleSentence: { updateMany: sentenceUpdateMany },
        }),
    );
    const repository = new ContextualTermsRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    const generatedAt = new Date('2026-07-31T05:00:00Z');

    await repository.completeContextualTermEnrichment({
      articleId: 'article-id',
      contentVersion: 4,
      termId: 'term-id',
      parentSentenceId: 'sentence-id',
      generatedAt,
      enrichment,
    });

    const sentenceUpdate = sentenceUpdateMany.mock.calls[0][0];
    expect(sentenceUpdate.where).toMatchObject({
      id: 'sentence-id',
      translationVi: null,
    });
    expect(sentenceUpdate.data).toEqual({
      translationVi: enrichment.sentenceTranslationVi,
      updatedAt: generatedAt,
    });
    const data = termUpdateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('contextualMeaningVi');
    expect(data).not.toHaveProperty('ipa');
    expect(data).not.toHaveProperty('synonyms');
    expect(data).not.toHaveProperty('examples');
    expect(data).not.toHaveProperty('origin');
    expect(data).not.toHaveProperty('reviewStatus');
    expect(data).toMatchObject({
      partOfSpeech: enrichment.partOfSpeech,
      cefrLevel: enrichment.cefrLevel,
      definitionEn: enrichment.definitionEn,
      contextualExplanation: enrichment.contextualExplanation,
      antonyms: enrichment.antonyms,
      collocations: enrichment.collocations,
      relatedTerms: enrichment.relatedTerms,
      explanationStatus: AiGenerationStatus.READY,
      explanationError: null,
    });
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects stale article or term state without applying enrichment', async () => {
    const termUpdateMany = jest.fn();
    const transaction: TransactionMock = jest.fn(
      (callback: (client: unknown) => Promise<unknown>) =>
        callback({
          articleSentenceTerm: {
            findFirst: jest.fn().mockResolvedValue(null),
            updateMany: termUpdateMany,
          },
        }),
    );
    const repository = new ContextualTermsRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      repository.completeContextualTermEnrichment({
        articleId: 'article-id',
        contentVersion: 4,
        termId: 'term-id',
        parentSentenceId: 'sentence-id',
        generatedAt: new Date(),
        enrichment,
      }),
    ).rejects.toBeInstanceOf(ContextualTermEnrichmentStateConflictError);
    expect(termUpdateMany).not.toHaveBeenCalled();
  });

  it('stores a bounded safe FAILED message without clearing enrichment fields', async () => {
    const updateMany: UpdateManyMock = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const repository = new ContextualTermsRepository({
      articleSentenceTerm: { updateMany },
    } as unknown as PrismaService);

    const longSafeError = 'safe failure '.repeat(100);
    await expect(
      repository.failContextualTermEnrichment(
        'article-id',
        4,
        'term-id',
        longSafeError,
      ),
    ).resolves.toBe(true);
    const failureData = updateMany.mock.calls[0][0].data;
    expect(failureData).toMatchObject({
      explanationStatus: AiGenerationStatus.FAILED,
    });
    expect(failureData.explanationError).toBe(longSafeError.slice(0, 500));
    expect(failureData.updatedAt).toBeInstanceOf(Date);
    expect(failureData).not.toHaveProperty('contextualMeaningVi');
    expect(failureData).not.toHaveProperty('examples');
  });
});
