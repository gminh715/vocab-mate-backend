import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
} from '../../../../../generated/prisma/enums';
import type { PrismaService } from '../../../../../src/database/prisma.service';
import {
  ArticlesRepository,
  type CompleteArticleAnalysisInput,
} from '../../../../../src/modules/articles/repositories/articles.repository';

interface StoredState {
  contentHtml: string;
  status: ArticleStatus;
  aiAnalysisStatus: AiGenerationStatus;
  cefrLevel: CefrLevel;
  termCount: number;
}

interface ArticleUpdateManyArgs {
  data: Record<string, unknown> & { cefrLevel?: CefrLevel };
  where: Record<string, unknown>;
}

describe('ArticlesRepository article analysis persistence', () => {
  const sourceContentHtml =
    '<p><span data-sentence-id="sentence-id">An ambitious plan.</span></p>';
  const annotatedContentHtml =
    '<p><span data-sentence-id="sentence-id">An <span data-term-id="term-id">ambitious</span> plan.</span></p>';
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
    sourceContentHtml,
    annotatedContentHtml,
    actingAdminId: 'admin-id',
    expectedSentences,
    articleCefrLevel: CefrLevel.A2,
    terms: [
      {
        id: 'term-id',
        sentenceId: 'sentence-id',
        value: 'ambitious',
        lemma: 'ambitious',
        cefrLevel: CefrLevel.B1,
        createdByUserId: 'admin-id',
        updatedByUserId: 'admin-id',
      },
    ],
  };

  const createRepository = (failTermWrite = false) => {
    let committed: StoredState = {
      contentHtml: sourceContentHtml,
      status: ArticleStatus.DRAFT,
      aiAnalysisStatus: AiGenerationStatus.PROCESSING,
      cefrLevel: CefrLevel.B1,
      termCount: 0,
    };
    const createMany = jest.fn<
      Promise<{ count: number }>,
      [{ data: Array<Record<string, unknown>> }]
    >();
    const updateMany = jest.fn<
      Promise<{ count: number }>,
      [ArticleUpdateManyArgs]
    >();
    const transaction = jest.fn(
      async (
        callback: (tx: {
          article: {
            updateMany: typeof updateMany;
            findUnique: () => Promise<{
              id: string;
              contentVersion: number;
              aiAnalysisStatus: AiGenerationStatus;
              cefrLevel: CefrLevel;
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
          article: {
            updateMany: updateMany.mockImplementation((args) => {
              working.contentHtml = input.annotatedContentHtml;
              working.aiAnalysisStatus = AiGenerationStatus.READY;
              working.cefrLevel = args.data.cefrLevel ?? working.cefrLevel;
              return Promise.resolve({ count: 1 });
            }),
            findUnique: () =>
              Promise.resolve({
                id: input.articleId,
                contentVersion: input.contentVersion,
                aiAnalysisStatus: working.aiAnalysisStatus,
                cefrLevel: working.cefrLevel,
                category: {
                  id: 'category-id',
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
                working.termCount += args.data.length;
                if (failTermWrite) {
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
      updateMany,
      transaction,
      state: () => committed,
    };
  };

  it('atomically stores marked HTML and local CEFR analysis with deferred enrichment', async () => {
    const context = createRepository();

    await expect(
      context.repository.completeArticleAnalysis(input),
    ).resolves.toMatchObject({
      articleId: 'article-id',
      contentVersion: 2,
      aiAnalysisStatus: AiGenerationStatus.READY,
      cefrLevel: CefrLevel.A2,
      candidateCount: 1,
    });

    expect(context.transaction).toHaveBeenCalledTimes(1);
    const articleUpdate = context.updateMany.mock.calls[0][0];
    expect(articleUpdate.where).toMatchObject({
      contentHtml: sourceContentHtml,
    });
    expect(articleUpdate.data).toMatchObject({
      contentHtml: annotatedContentHtml,
      cefrLevel: CefrLevel.A2,
    });
    expect(context.createMany.mock.calls[0][0].data[0]).toMatchObject({
      id: 'term-id',
      sentenceId: 'sentence-id',
      value: 'ambitious',
      lemma: 'ambitious',
      wordDisplay: null,
      normalizedLemma: null,
      unitType: 'WORD',
      partOfSpeech: null,
      cefrLevel: CefrLevel.B1,
      origin: 'NLP',
      reviewStatus: 'APPROVED',
      explanationStatus: 'PENDING',
      selectionReason: null,
      contextualMeaningVi: null,
      definitionEn: null,
      contextualExplanation: null,
      ipa: null,
      synonyms: [],
      antonyms: [],
      collocations: [],
      relatedTerms: [],
      examples: [],
      isActive: true,
      isLookupEnabled: true,
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });
    expect(context.state()).toEqual({
      contentHtml: annotatedContentHtml,
      status: ArticleStatus.DRAFT,
      aiAnalysisStatus: AiGenerationStatus.READY,
      cefrLevel: CefrLevel.A2,
      termCount: 1,
    });
  });

  it('rolls back marked HTML when term insertion fails', async () => {
    const context = createRepository(true);

    await expect(
      context.repository.completeArticleAnalysis(input),
    ).rejects.toThrow('simulated insert failure');
    expect(context.state()).toEqual({
      contentHtml: sourceContentHtml,
      status: ArticleStatus.DRAFT,
      aiAnalysisStatus: AiGenerationStatus.PROCESSING,
      cefrLevel: CefrLevel.B1,
      termCount: 0,
    });
  });
});
