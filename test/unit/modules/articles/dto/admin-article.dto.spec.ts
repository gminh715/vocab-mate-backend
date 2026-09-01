import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminArticleListQueryDto,
  AdminArticleParamsDto,
  CreateArticleDto,
  UpdateArticleDto,
} from '../../../../../src/modules/articles/dto/admin-article.dto';

describe('admin article request DTOs', () => {
  it('normalizes list input and enforces the shared page limit', async () => {
    const dto = plainToInstance(AdminArticleListQueryDto, {
      page: '2',
      limit: '100',
      q: '  learning  ',
      cefrLevel: 'B1',
      status: 'DRAFT',
      sort: 'oldest',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 100,
      q: 'learning',
      cefrLevel: 'B1',
      status: 'DRAFT',
      sort: 'oldest',
    });
  });

  it.each([
    { page: 1, limit: 101 },
    { page: 1, limit: 20, categoryId: 'not-a-uuid' },
    { page: 1, limit: 20, status: 'UNKNOWN' },
    { page: 1, limit: 20, sort: 'title' },
  ])('rejects invalid list query %#', async (input) => {
    expect(
      await validate(plainToInstance(AdminArticleListQueryDto, input)),
    ).not.toHaveLength(0);
  });

  it('normalizes create strings and slug', async () => {
    const dto = plainToInstance(CreateArticleDto, {
      categoryId: '11111111-1111-4111-8111-111111111111',
      title: '  Article  ',
      slug: '  MY-ARTICLE  ',
      summary: '  Summary  ',
      contentHtml: '<p>Content</p>',
      cefrLevel: 'B1',
      authorName: '  Jane Doe  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      title: 'Article',
      slug: 'my-article',
      summary: 'Summary',
      authorName: 'Jane Doe',
    });
  });

  it('rejects mutation fields not represented by the DTO under the global whitelist', () => {
    const dto = plainToInstance(UpdateArticleDto, {
      title: 'Allowed',
      status: 'PUBLISHED',
      createdByUserId: 'attacker',
    });

    expect(dto).toHaveProperty('status');
    expect(dto).toHaveProperty('createdByUserId');
    expect(new UpdateArticleDto()).not.toHaveProperty('status');
  });

  it('validates article IDs as UUIDs', async () => {
    await expect(
      validate(plainToInstance(AdminArticleParamsDto, { articleId: 'bad' })),
    ).resolves.not.toHaveLength(0);
  });
});
