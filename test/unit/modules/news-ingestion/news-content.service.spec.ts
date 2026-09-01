import type { NewsConfig } from '../../../../src/config/news.config';
import { ArticleContentService } from '../../../../src/modules/articles/services/article-content.service';
import { NewsIngestionError } from '../../../../src/modules/news-ingestion/news-ingestion.errors';
import type { NormalizedNewsImportArticle } from '../../../../src/modules/news-ingestion/news-ingestion.types';
import { NewsContentService } from '../../../../src/modules/news-ingestion/services/news-content.service';

const config: NewsConfig = {
  guardianApiKey: 'test',
  guardianBaseUrl: 'https://content.guardianapis.com',
  requestTimeoutMs: 1000,
  maxResponseBytes: 100000,
  minArticleCharacters: 100,
  minRequestIntervalMs: 0,
  defaultPageSize: 5,
  maxPageSize: 10,
};

const article: NormalizedNewsImportArticle = {
  externalId: 'technology/2026/jul/30/report',
  title: 'A complete report',
  description: 'Description',
  providerContent: `<div><p>${'Complete Guardian content for learners. '.repeat(10)}</p><script>bad()</script></div>`,
  url: 'https://www.theguardian.com/technology/2026/jul/30/report',
  imageUrl: null,
  sourceName: 'The Guardian',
  publishedAt: new Date('2026-07-30T00:00:00Z'),
  authorName: 'Reporter',
  sectionId: 'technology',
  sectionName: 'Technology',
};

describe('NewsContentService', () => {
  const contentService = new ArticleContentService();

  it('sanitizes usable Guardian body HTML and extracts plain text', () => {
    const service = new NewsContentService(config, contentService);
    const result = service.resolve(article);

    expect(result.plainText).toContain('Complete Guardian content');
    expect(result.contentHtml).toContain('<p>');
    expect(result.contentHtml).not.toContain('<script>');
    expect(result.contentHtml).not.toContain('bad()');
  });

  it.each([
    ['missing', null],
    ['blank', '   '],
    ['too short', '<p>Short.</p>'],
    ['placeholder', '<p>Read the full article</p>'],
    ['unusable after sanitization', '<script>alert(1)</script>'],
  ])(
    'rejects a %s body with the stable safe code',
    (_name, providerContent) => {
      const service = new NewsContentService(config, contentService);

      try {
        service.resolve({ ...article, providerContent });
        throw new Error('Expected the body to be rejected');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(NewsIngestionError);
        if (!(error instanceof NewsIngestionError)) throw error;
        expect(error.code).toBe('GUARDIAN_BODY_UNAVAILABLE');
        expect(error.message).toBe('Guardian article body is unavailable');
      }
    },
  );

  it('rejects a body over the configured resource bound', () => {
    const service = new NewsContentService(
      { ...config, maxResponseBytes: 100 },
      contentService,
    );

    try {
      service.resolve({
        ...article,
        providerContent: `<p>${'large body '.repeat(20)}</p>`,
      });
      throw new Error('Expected the body to be rejected');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NewsIngestionError);
      if (!(error instanceof NewsIngestionError)) throw error;
      expect(error.code).toBe('GUARDIAN_BODY_UNAVAILABLE');
    }
  });
});
