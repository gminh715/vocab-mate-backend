import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ArticleSlugParamsDto,
  ArticleSort,
  GetArticlesQueryDto,
} from './get-articles-query.dto';

describe('article request DTOs', () => {
  it('converts pagination and normalizes optional query fields', async () => {
    const dto = plainToInstance(GetArticlesQueryDto, {
      page: '2',
      limit: '20',
      q: '  learning  ',
      categorySlug: '  TECHNOLOGY  ',
      cefrLevel: 'B1',
      sort: 'newest',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 20,
      q: 'learning',
      categorySlug: 'technology',
      cefrLevel: 'B1',
      sort: ArticleSort.NEWEST,
    });
  });

  it.each([
    ['missing page', { limit: 20, sort: 'newest' }],
    ['missing limit', { page: 1, sort: 'newest' }],
    ['missing sort', { page: 1, limit: 20 }],
    ['page below one', { page: 0, limit: 20, sort: 'newest' }],
    ['limit below one', { page: 1, limit: 0, sort: 'newest' }],
    ['limit above maximum', { page: 1, limit: 101, sort: 'newest' }],
    ['blank search', { page: 1, limit: 20, sort: 'newest', q: '   ' }],
    [
      'invalid category slug',
      { page: 1, limit: 20, sort: 'newest', categorySlug: 'not_valid' },
    ],
    [
      'invalid CEFR level',
      { page: 1, limit: 20, sort: 'newest', cefrLevel: 'B3' },
    ],
    ['arbitrary sort', { page: 1, limit: 20, sort: 'title' }],
  ])('rejects %s', async (_case, input) => {
    const dto = plainToInstance(GetArticlesQueryDto, input);

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('normalizes and validates an article slug', async () => {
    const dto = plainToInstance(ArticleSlugParamsDto, {
      slug: '  How-Technology-Changes-Learning  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.slug).toBe('how-technology-changes-learning');
  });

  it.each(['', 'not_valid', '-article', 'article-'])(
    'rejects invalid article slug %p',
    async (slug) => {
      const dto = plainToInstance(ArticleSlugParamsDto, { slug });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});
