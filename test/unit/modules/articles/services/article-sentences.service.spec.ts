import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ArticleStatus } from '../../../../../generated/prisma/enums';
import { SentenceParserHelper } from '../../../../../src/modules/articles/helpers/sentence-parser.helper';
import { HtmlSanitizerHelper } from '../../../../../src/modules/articles/helpers/html-sanitizer.helper';
import { ArticlesRepository } from '../../../../../src/modules/articles/repositories/articles.repository';
import {
  ArticleSentencesRepository,
  type ReplaceParsedContentInput,
} from '../../../../../src/modules/articles/repositories/article-sentences.repository';
import { ArticleSentencesService } from '../../../../../src/modules/articles/services/article-sentences.service';

describe('ArticleSentencesService', () => {
  const repository = {
    findMutationState: jest.fn(),
    countSentences: jest.fn(),
    replaceParsedContent: jest.fn<Promise<void>, [ReplaceParsedContentInput]>(),
    findSentences: jest.fn(),
    findSentenceDetail: jest.fn(),
    updateSentence: jest.fn(),
  };
  const service = new ArticleSentencesService(
    repository as unknown as ArticlesRepository,
    repository as unknown as ArticleSentencesRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findMutationState.mockResolvedValue({
      id: 'article-id',
      status: ArticleStatus.DRAFT,
      contentHtml: '<p>First sentence. Second sentence.</p>',
      contentVersion: 4,
    });
    repository.countSentences.mockResolvedValue(0);
    repository.replaceParsedContent.mockResolvedValue(undefined);
  });

  it('keeps contentVersion stable and delegates one atomic HTML/row replacement', async () => {
    const result = await service.parseContent('admin-id', 'article-id', {});

    expect(result).toMatchObject({ contentVersion: 4, sentenceCount: 2 });
    expect(repository.replaceParsedContent).toHaveBeenCalledTimes(1);
    const input = repository.replaceParsedContent.mock.calls[0][0] as {
      contentVersion: number;
      annotatedContentHtml: string;
      sentences: Array<{ id: string; sentenceOrder: number }>;
    };
    expect(input.contentVersion).toBe(4);
    expect(input.sentences.map(({ sentenceOrder }) => sentenceOrder)).toEqual([
      1, 2,
    ]);
    expect(
      new Set(
        [
          ...input.annotatedContentHtml.matchAll(/data-sentence-id="([^"]+)"/g),
        ].map((match) => match[1]),
      ),
    ).toEqual(new Set(input.sentences.map(({ id }) => id)));
    expect(input.annotatedContentHtml).toBe(
      HtmlSanitizerHelper.sanitize(input.annotatedContentHtml),
    );
  });

  it('rejects duplicate parsing unless force is true', async () => {
    repository.countSentences.mockResolvedValue(2);

    await expect(
      service.parseContent('admin-id', 'article-id', {}),
    ).rejects.toThrow(ConflictException);
    expect(repository.replaceParsedContent).not.toHaveBeenCalled();

    await expect(
      service.parseContent('admin-id', 'article-id', { force: true }),
    ).resolves.toMatchObject({ sentenceCount: 2 });
  });

  it('rejects archived and unparseable content', async () => {
    repository.findMutationState.mockResolvedValueOnce({
      id: 'article-id',
      status: ArticleStatus.ARCHIVED,
      contentHtml: '<p>Archived.</p>',
      contentVersion: 1,
    });
    await expect(
      service.parseContent('admin-id', 'article-id', {}),
    ).rejects.toThrow(ConflictException);

    repository.findMutationState.mockResolvedValueOnce({
      id: 'article-id',
      status: ArticleStatus.DRAFT,
      contentHtml: '<figure><img src="https://example.com/a.png"></figure>',
      contentVersion: 1,
    });
    await expect(
      service.parseContent('admin-id', 'article-id', {}),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('does not begin persistence when annotation fails', async () => {
    const parser = jest
      .spyOn(SentenceParserHelper, 'parse')
      .mockImplementationOnce(() => {
        throw new Error('annotation failure');
      });

    await expect(
      service.parseContent('admin-id', 'article-id', {}),
    ).rejects.toThrow('annotation failure');
    expect(repository.replaceParsedContent).not.toHaveBeenCalled();
    parser.mockRestore();
  });

  it('updates only allowed metadata with the authenticated audit ID', async () => {
    repository.updateSentence.mockResolvedValue({
      id: 'sentence-id',
      sentenceText: 'Immutable.',
      translationVi: 'Bản dịch',
      isActive: false,
    });

    await service.update('admin-id', 'article-id', 'sentence-id', {
      translationVi: 'Bản dịch',
      isActive: false,
    });

    expect(repository.updateSentence).toHaveBeenCalledWith(
      'article-id',
      'sentence-id',
      {
        translationVi: 'Bản dịch',
        isActive: false,
      },
    );
  });
});
