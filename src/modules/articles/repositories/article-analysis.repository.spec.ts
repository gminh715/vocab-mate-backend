import {
  AiGenerationStatus,
  ArticleStatus,
} from '../../../../generated/prisma/enums';
import type { PrismaService } from '../../../database/prisma.service';
import {
  ArticlesRepository,
  type CompleteArticleAnalysisInput,
} from './articles.repository';

interface StoredState {
  summary: string;
  status: ArticleStatus;
  aiAnalysisStatus: AiGenerationStatus;
  candidateCount: number;
}

describe('ArticlesRepository article analysis persistence', () => {
  const expectedSentences = [
    {
      id: 'sentence-id',
      sentenceOrder: 1,
      sentenceText: 'An ambitious plan.',
      terms: [],
    },
  ];
  const input: CompleteArticleAnalysisInput = {
    articleId: 'article-id',
    contentVersion: 2,
    sourceContentHtml:
      '<p><span data-sentence-id="sentence-id">An ambitious plan.</span></p>',
    categoryId: 'category-id',
    summary: 'A concise summary.',
    cefrLevel: 'B1',
    actingAdminId: 'admin-id',
    expectedSentences,
    terms: [
      {
        id: 'term-id',
        sentenceId: 'sentence-id',
        value: 'ambitious',
        wordDisplay: 'ambitious',
        lemma: 'ambitious',
        normalizedLemma: 'ambitious',
        unitType: 'WORD',
        partOfSpeech: 'adjective',
        cefrLevel: 'B1',
        selectionReason: 'Useful learner vocabulary.',
        createdByUserId: 'admin-id',
        updatedByUserId: 'admin-id',
      },
    ],
  };

  const createRepository = (failCandidateWrite = false) => {
    let committed: StoredState = {
      summary: 'Old summary',
      status: ArticleStatus.DRAFT,
      aiAnalysisStatus: AiGenerationStatus.PROCESSING,
      candidateCount: 0,
    };
    const createMany = jest.fn<
      Promise<{ count: number }>,
      [{ data: Array<Record<string, unknown>> }]
    >();
    const transaction = jest.fn(
      async (
        callback: (tx: {
          category: { count: () => Promise<number> };
          article: {
            updateMany: () => Promise<{ count: number }>;
            findUnique: () => Promise<{
              id: string;
              contentVersion: number;
              aiAnalysisStatus: AiGenerationStatus;
              cefrLevel: 'B1';
              category: { id: string; slug: string; name: string };
            }>;
          };
          articleSentence: {
            findMany: () => Promise<typeof expectedSentences>;
          };
          articleSentenceTerm: {
            createMany: (args: {
              data: Array<Record<string, unknown>>;
            }) => Promise<{ count: number }>;
          };
        }) => Promise<unknown>,
      ) => {
        const working = structuredClone(committed);
        const tx = {
          category: { count: () => Promise.resolve(1) },
          article: {
            updateMany: () => {
              working.summary = input.summary;
              working.aiAnalysisStatus = AiGenerationStatus.READY;
              return Promise.resolve({ count: 1 });
            },
            findUnique: () =>
              Promise.resolve({
                id: input.articleId,
                contentVersion: input.contentVersion,
                aiAnalysisStatus: working.aiAnalysisStatus,
                cefrLevel: 'B1' as const,
                category: {
                  id: input.categoryId,
                  slug: 'society',
                  name: 'Society',
                },
              }),
          },
          articleSentence: {
            findMany: () => Promise.resolve(expectedSentences),
          },
          articleSentenceTerm: {
            createMany: createMany.mockImplementation(
              (args: { data: Array<Record<string, unknown>> }) => {
                working.candidateCount += args.data.length;
                if (failCandidateWrite) {
                  return Promise.reject(new Error('simulated insert failure'));
                }
                return Promise.resolve({ count: args.data.length });
              },
            ),
          },
        };

        const result = await callback(tx);
        committed = working;
        return result;
      },
    );
    const repository = new ArticlesRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    return {
      repository,
      createMany,
      transaction,
      state: () => committed,
    };
  };

  it('writes READY metadata and hidden pending AI candidates in one short transaction', async () => {
    const context = createRepository();

    await expect(
      context.repository.completeArticleAnalysis(input),
    ).resolves.toMatchObject({
      articleId: 'article-id',
      contentVersion: 2,
      aiAnalysisStatus: AiGenerationStatus.READY,
      candidateCount: 1,
    });

    expect(context.transaction).toHaveBeenCalledTimes(1);
    expect(context.createMany).toHaveBeenCalledTimes(1);
    expect(context.createMany.mock.calls[0][0].data[0]).toMatchObject({
      id: 'term-id',
      origin: 'AI',
      reviewStatus: 'PENDING',
      explanationStatus: 'PENDING',
      selectionReason: 'Useful learner vocabulary.',
      contextualMeaningVi: null,
      definitionEn: null,
      contextualExplanation: null,
      ipa: null,
      synonyms: [],
      antonyms: [],
      collocations: [],
      relatedTerms: [],
      examples: [],
      isActive: false,
      isLookupEnabled: false,
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });
    expect(context.state()).toEqual({
      summary: 'A concise summary.',
      status: ArticleStatus.DRAFT,
      aiAnalysisStatus: AiGenerationStatus.READY,
      candidateCount: 1,
    });
  });

  it('rolls back article metadata when candidate insertion fails', async () => {
    const context = createRepository(true);

    await expect(
      context.repository.completeArticleAnalysis(input),
    ).rejects.toThrow('simulated insert failure');
    expect(context.state()).toEqual({
      summary: 'Old summary',
      status: ArticleStatus.DRAFT,
      aiAnalysisStatus: AiGenerationStatus.PROCESSING,
      candidateCount: 0,
    });
  });
});
