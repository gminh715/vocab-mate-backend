import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AddCollectionItemsDto,
  CollectionItemSort,
  CreateCollectionDto,
  GetCollectionItemsQueryDto,
  GetCollectionsQueryDto,
  MAX_COLLECTION_ITEM_BATCH_SIZE,
  UpdateCollectionDto,
} from './collection-request.dto';

describe('Collection request DTOs', () => {
  it('applies list defaults and trims a supplied search', async () => {
    const defaults = plainToInstance(GetCollectionsQueryDto, {});
    const search = plainToInstance(GetCollectionsQueryDto, {
      page: '2',
      limit: '10',
      q: '  technology  ',
    });

    await expect(validate(defaults)).resolves.toHaveLength(0);
    expect(defaults).toMatchObject({ page: 1, limit: 20 });
    await expect(validate(search)).resolves.toHaveLength(0);
    expect(search).toMatchObject({ page: 2, limit: 10, q: 'technology' });
  });

  it('rejects blank collection names and blank searches', async () => {
    const create = plainToInstance(CreateCollectionDto, { name: '   ' });
    const query = plainToInstance(GetCollectionsQueryDto, { q: '   ' });

    await expect(validate(create)).resolves.not.toHaveLength(0);
    await expect(validate(query)).resolves.not.toHaveLength(0);
  });

  it('preserves null as an explicit description clearing value', async () => {
    const update = plainToInstance(UpdateCollectionDto, {
      description: null,
    });

    await expect(validate(update)).resolves.toHaveLength(0);
    expect(update.description).toBeNull();
  });

  it('validates required item pagination and applies the allowlisted default sort', async () => {
    const valid = plainToInstance(GetCollectionItemsQueryDto, {
      page: '1',
      limit: '20',
      q: '  harmful  ',
    });
    const missingPagination = plainToInstance(GetCollectionItemsQueryDto, {});

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toMatchObject({
      page: 1,
      limit: 20,
      q: 'harmful',
      sort: CollectionItemSort.NEWEST,
    });
    await expect(validate(missingPagination)).resolves.not.toHaveLength(0);
  });

  it('requires a nonempty bounded UUID array under the userVocabularyIds property', async () => {
    const valid = plainToInstance(AddCollectionItemsDto, {
      userVocabularyIds: [
        ' 550e8400-e29b-41d4-a716-446655440020 ',
        '550e8400-e29b-41d4-a716-446655440021',
      ],
    });
    const empty = plainToInstance(AddCollectionItemsDto, {
      userVocabularyIds: [],
    });
    const oversized = plainToInstance(AddCollectionItemsDto, {
      userVocabularyIds: Array.from(
        { length: MAX_COLLECTION_ITEM_BATCH_SIZE + 1 },
        () => '550e8400-e29b-41d4-a716-446655440020',
      ),
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid.userVocabularyIds[0]).toBe(
      '550e8400-e29b-41d4-a716-446655440020',
    );
    await expect(validate(empty)).resolves.not.toHaveLength(0);
    await expect(validate(oversized)).resolves.not.toHaveLength(0);
  });
});
