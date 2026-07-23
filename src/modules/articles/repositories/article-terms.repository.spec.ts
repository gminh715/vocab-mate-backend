import { ArticleStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  ArticleTermReferencedError,
  ArticlesRepository,
  type CreateArticleTermInput,
  type TermMarkerWriteInput,
} from './articles.repository';

describe('ArticlesRepository term queries', () => {
  const article = {
    findUnique: jest.fn<Promise<unknown>, [unknown]>(),
    updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
  };
  const articleSentence = {
    count: jest.fn<Promise<number>, [unknown]>(),
  };
  const articleSentenceTerm = {
    create: jest.fn<Promise<unknown>, [unknown]>(),
    findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
    count: jest.fn<Promise<number>, [unknown]>(),
    deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
  };
  const userVocabulary = {
    count: jest.fn<Promise<number>, [unknown]>(),
  };
  const quizQuestion = {
    count: jest.fn<Promise<number>, [unknown]>(),
  };
  const reviewAnswer = {
    count: jest.fn<Promise<number>, [unknown]>(),
  };
  const transactionClient = {
    article,
    articleSentence,
    articleSentenceTerm,
    userVocabulary,
    quizQuestion,
    reviewAnswer,
  };
  const prisma = {
    ...transactionClient,
    $transaction: jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };
  const repository = new ArticlesRepository(prisma as unknown as PrismaService);
  const marker: TermMarkerWriteInput = {
    articleId: 'article-id',
    sentenceId: 'sentence-id',
    termId: 'term-id',
    contentVersion: 3,
    sourceContentHtml: '<p>old</p>',
    updatedContentHtml: '<p>new</p>',
    actingAdminId: 'admin-id',
  };
  const termInput: CreateArticleTermInput = {
    id: 'term-id',
    sentenceId: 'sentence-id',
    value: 'term',
    wordDisplay: 'term',
    lemma: 'term',
    normalizedLemma: 'term',
    unitType: 'WORD',
    partOfSpeech: 'noun',
    cefrLevel: 'B1',
    contextualMeaningVi: 'nghĩa',
    synonyms: [],
    antonyms: [],
    collocations: [],
    relatedTerms: [],
    examples: [],
    isLookupEnabled: true,
    isActive: true,
    createdByUserId: 'admin-id',
    updatedByUserId: 'admin-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    article.updateMany.mockResolvedValue({ count: 1 });
    articleSentence.count.mockResolvedValue(1);
    articleSentenceTerm.count.mockResolvedValue(1);
    articleSentenceTerm.create.mockResolvedValue({ id: 'term-id' });
    articleSentenceTerm.deleteMany.mockResolvedValue({ count: 1 });
    userVocabulary.count.mockResolvedValue(0);
    quizQuestion.count.mockResolvedValue(0);
    reviewAnswer.count.mockResolvedValue(0);
  });

  it('creates a term and updates matching current HTML in one transaction', async () => {
    await repository.createTermWithMarker(marker, termInput);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(articleSentence.count).toHaveBeenCalledWith({
      where: {
        id: 'sentence-id',
        articleId: 'article-id',
        contentVersion: 3,
        isActive: true,
      },
    });
    expect(article.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'article-id',
        contentVersion: 3,
        contentHtml: '<p>old</p>',
        status: { not: ArticleStatus.ARCHIVED },
      },
      data: { contentHtml: '<p>new</p>', updatedByUserId: 'admin-id' },
    });
    expect(articleSentenceTerm.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: termInput }),
    );
  });

  it('paginates and filters terms through current-version sentence ownership', async () => {
    article.findUnique.mockResolvedValue({ contentVersion: 4 });
    articleSentenceTerm.findMany.mockResolvedValue([]);
    articleSentenceTerm.count.mockResolvedValue(0);

    await repository.findTerms('article-id', {
      page: 2,
      limit: 10,
      sentenceId: 'sentence-id',
      cefrLevel: 'B2',
      unitType: 'PHRASE',
      isActive: false,
      q: 'digital',
    });

    const findManyInput = articleSentenceTerm.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      skip: number;
      take: number;
      orderBy: object[];
    };
    expect(findManyInput.where).toMatchObject({
      sentenceId: 'sentence-id',
      cefrLevel: 'B2',
      unitType: 'PHRASE',
      isActive: false,
      sentence: {
        is: { articleId: 'article-id', contentVersion: 4 },
      },
    });
    expect(findManyInput).toMatchObject({
      skip: 10,
      take: 10,
      orderBy: [
        { sentence: { sentenceOrder: 'asc' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
  });

  it('checks all historical references before changing HTML or deleting', async () => {
    quizQuestion.count.mockResolvedValue(1);

    await expect(
      repository.deleteTermWithMarker(marker),
    ).rejects.toBeInstanceOf(ArticleTermReferencedError);
    expect(article.updateMany).not.toHaveBeenCalled();
    expect(articleSentenceTerm.deleteMany).not.toHaveBeenCalled();
  });

  it('scopes an unused delete to the current article, version, and sentence', async () => {
    await repository.deleteTermWithMarker(marker);

    const currentWhere = {
      id: 'term-id',
      sentenceId: 'sentence-id',
      sentence: {
        is: { articleId: 'article-id', contentVersion: 3 },
      },
    };
    expect(articleSentenceTerm.count).toHaveBeenCalledWith({
      where: currentWhere,
    });
    expect(articleSentenceTerm.deleteMany).toHaveBeenCalledWith({
      where: currentWhere,
    });
  });
});
