import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LearningStatus } from '../../../generated/prisma/enums';
import { CollectionItemSort } from './dto/collection-request.dto';
import {
  CollectionNotAccessibleError,
  CollectionsRepository,
  CollectionVocabulariesNotAccessibleError,
} from './collections.repository';
import { CollectionsService } from './collections.service';

interface CollectionsRepositoryMock {
  list: jest.Mock;
  findOwnedDetail: jest.Mock;
  create: jest.Mock;
  updateOwned: jest.Mock;
  deleteOwned: jest.Mock;
  findOwnedId: jest.Mock;
  listItems: jest.Mock;
  addItems: jest.Mock;
  deleteOwnedItem: jest.Mock;
}

const collection = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Technology',
  description: null,
  createdAt: new Date('2026-07-23T01:00:00Z'),
  updatedAt: new Date('2026-07-23T01:00:00Z'),
};

describe('CollectionsService', () => {
  let service: CollectionsService;
  let repository: CollectionsRepositoryMock;

  beforeEach(async () => {
    repository = {
      list: jest.fn(),
      findOwnedDetail: jest.fn(),
      create: jest.fn(),
      updateOwned: jest.fn(),
      deleteOwned: jest.fn(),
      findOwnedId: jest.fn(),
      listItems: jest.fn(),
      addItems: jest.fn(),
      deleteOwnedItem: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: CollectionsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(CollectionsService);
  });

  it('normalizes owner-scoped search and maps counts plus pagination', async () => {
    repository.list.mockResolvedValue({
      items: [{ ...collection, _count: { items: 7 } }],
      total: 21,
    });

    await expect(
      service.findAll('owner-id', {
        page: 2,
        limit: 10,
        q: '  tech  ',
      }),
    ).resolves.toEqual({
      items: [{ ...collection, vocabularyCount: 7 }],
      meta: {
        page: 2,
        limit: 10,
        total: 21,
        totalPages: 3,
      },
    });
    expect(repository.list).toHaveBeenCalledWith('owner-id', {
      page: 2,
      limit: 10,
      q: 'tech',
    });
  });

  it('returns owned detail and hides missing or non-owned collections', async () => {
    repository.findOwnedDetail.mockResolvedValueOnce({
      ...collection,
      _count: { items: 2 },
    });

    await expect(service.findOne('owner-id', collection.id)).resolves.toEqual({
      collection,
      vocabularyCount: 2,
    });

    repository.findOwnedDetail.mockResolvedValueOnce(null);
    await expect(service.findOne('other-owner', collection.id)).rejects.toThrow(
      new NotFoundException('Collection not found'),
    );
  });

  it('trims create input, derives ownership, and maps concurrent duplicates', async () => {
    repository.create.mockResolvedValueOnce(collection);

    await expect(
      service.create('owner-id', {
        name: '  Technology  ',
        description: '  Software words  ',
      }),
    ).resolves.toEqual({ collection });
    expect(repository.create).toHaveBeenCalledWith('owner-id', {
      name: 'Technology',
      description: 'Software words',
    });

    repository.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      service.create('owner-id', { name: 'Technology' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('performs a real partial update and supports explicit description clearing', async () => {
    repository.updateOwned.mockResolvedValue(collection);

    await service.update('owner-id', collection.id, {
      name: '  Updated  ',
    });
    expect(repository.updateOwned).toHaveBeenLastCalledWith(
      'owner-id',
      collection.id,
      { name: 'Updated' },
    );

    await service.update('owner-id', collection.id, { description: null });
    expect(repository.updateOwned).toHaveBeenLastCalledWith(
      'owner-id',
      collection.id,
      { description: null },
    );
  });

  it('rejects empty PATCH and maps inaccessible update to generic not found', async () => {
    await expect(
      service.update('owner-id', collection.id, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateOwned).not.toHaveBeenCalled();

    repository.updateOwned.mockResolvedValue(null);
    await expect(
      service.update('other-owner', collection.id, { name: 'Hidden' }),
    ).rejects.toThrow(new NotFoundException('Collection not found'));
  });

  it('maps an update unique race to conflict', async () => {
    repository.updateOwned.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.update('owner-id', collection.id, { name: 'Duplicate' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes only an owned collection and returns no data', async () => {
    repository.deleteOwned.mockResolvedValueOnce(true);
    await expect(
      service.delete('owner-id', collection.id),
    ).resolves.toBeUndefined();

    repository.deleteOwned.mockResolvedValueOnce(false);
    await expect(service.delete('other-owner', collection.id)).rejects.toThrow(
      new NotFoundException('Collection not found'),
    );
  });

  it('requires collection ownership and maps paginated snapshot-only items', async () => {
    const addedAt = new Date('2026-07-23T03:00:00Z');
    repository.findOwnedId.mockResolvedValue({ id: collection.id });
    repository.listItems.mockResolvedValue({
      items: [
        {
          addedAt,
          userVocabulary: {
            id: '22222222-2222-4222-8222-222222222222',
            savedWordDisplay: 'harmful',
            learningStatus: LearningStatus.NEW,
          },
        },
      ],
      total: 1,
    });

    await expect(
      service.findItems('owner-id', collection.id, {
        page: 1,
        limit: 20,
        q: '  harm  ',
        learningStatus: LearningStatus.NEW,
        sort: CollectionItemSort.NEWEST,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          savedWordDisplay: 'harmful',
          learningStatus: LearningStatus.NEW,
          addedAt,
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(repository.listItems).toHaveBeenCalledWith(
      'owner-id',
      collection.id,
      {
        page: 1,
        limit: 20,
        q: 'harm',
        learningStatus: LearningStatus.NEW,
        sort: CollectionItemSort.NEWEST,
      },
    );

    repository.findOwnedId.mockResolvedValue(null);
    await expect(
      service.findItems('other-owner', collection.id, {
        page: 1,
        limit: 20,
        sort: CollectionItemSort.NEWEST,
      }),
    ).rejects.toThrow(new NotFoundException('Collection not found'));
  });

  it('deduplicates bulk IDs while preserving original added/skipped accounting', async () => {
    repository.addItems.mockResolvedValue({ count: 1 });
    const firstId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    await expect(
      service.addItems('owner-id', collection.id, {
        userVocabularyIds: [firstId, firstId.toLowerCase(), secondId],
      }),
    ).resolves.toEqual({ addedCount: 1, skippedCount: 2 });
    expect(repository.addItems).toHaveBeenCalledWith(
      'owner-id',
      collection.id,
      [firstId.toLowerCase(), secondId],
    );
  });

  it('maps invalid collection and vocabulary ownership without leaking IDs', async () => {
    repository.addItems.mockRejectedValueOnce(
      new CollectionNotAccessibleError(),
    );
    await expect(
      service.addItems('other-owner', collection.id, {
        userVocabularyIds: ['22222222-2222-4222-8222-222222222222'],
      }),
    ).rejects.toThrow(new NotFoundException('Collection not found'));

    repository.addItems.mockRejectedValueOnce(
      new CollectionVocabulariesNotAccessibleError(),
    );
    await expect(
      service.addItems('owner-id', collection.id, {
        userVocabularyIds: ['33333333-3333-4333-8333-333333333333'],
      }),
    ).rejects.toThrow(
      new UnprocessableEntityException(
        'One or more saved vocabularies are unavailable',
      ),
    );
  });

  it('removes only an owner-scoped relation and maps every inaccessible case to not found', async () => {
    repository.deleteOwnedItem.mockResolvedValueOnce(true);
    await expect(
      service.deleteItem(
        'owner-id',
        collection.id,
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toBeUndefined();

    repository.deleteOwnedItem.mockResolvedValueOnce(false);
    await expect(
      service.deleteItem(
        'other-owner',
        collection.id,
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toThrow(new NotFoundException('Collection item not found'));
  });
});
