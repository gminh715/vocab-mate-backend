import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminNewsSearchQueryDto,
  AdminNewsSyncDto,
} from '../../../../../src/modules/news-ingestion/dto/admin-news.dto';

describe('admin news DTOs', () => {
  it('applies bounded Guardian search defaults', async () => {
    const dto = plainToInstance(AdminNewsSearchQueryDto, {
      q: 'technology',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      q: 'technology',
      page: 1,
      pageSize: 5,
      orderBy: 'newest',
    });
  });

  it('allows optional q or section for discovery operations', async () => {
    const search = plainToInstance(AdminNewsSearchQueryDto, {});
    const sync = plainToInstance(AdminNewsSyncDto, {
      defaultCategoryId: '550e8400-e29b-41d4-a716-446655440000',
      articleIds: ['art-1', 'art-2'],
    });

    await expect(validate(search)).resolves.toHaveLength(0);
    await expect(validate(sync)).resolves.toHaveLength(0);
  });

  it('normalizes and accepts bounded Guardian criteria', async () => {
    const dto = plainToInstance(AdminNewsSearchQueryDto, {
      section: ' Technology ',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      page: 2,
      pageSize: 10,
      orderBy: 'RELEVANCE',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      section: 'technology',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      page: 2,
      pageSize: 10,
      orderBy: 'relevance',
    });
  });

  it.each([
    [{ q: 'test', section: 'bad/section' }, 'section'],
    [{ q: 'test', fromDate: '2026-02-30' }, 'fromDate'],
    [{ q: 'test', fromDate: '2026-08-01', toDate: '2026-07-31' }, 'dateRange'],
    [{ q: 'test', page: 0 }, 'page'],
    [{ q: 'test', pageSize: 11 }, 'pageSize'],
    [{ q: 'test', orderBy: 'popular' }, 'orderBy'],
  ])('rejects invalid search input on %s', async (input, property) => {
    expect(
      await validate(plainToInstance(AdminNewsSearchQueryDto, input)),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ property })]));
  });

  it('caps synchronous imports at ten results', async () => {
    const valid = plainToInstance(AdminNewsSyncDto, {
      section: 'technology',
      defaultCategoryId: '550e8400-e29b-41d4-a716-446655440000',
      pageSize: 10,
    });
    const invalid = plainToInstance(AdminNewsSyncDto, {
      q: 'learning',
      defaultCategoryId: '550e8400-e29b-41d4-a716-446655440000',
      pageSize: 11,
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'pageSize' }),
      ]),
    );
  });
});
