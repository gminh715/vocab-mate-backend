import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesRepository } from '../../../../src/modules/categories/categories.repository';
import { CategoriesService } from '../../../../src/modules/categories/categories.service';

interface CategoriesRepositoryMock {
  findActive: jest.Mock;
  findActiveBySlug: jest.Mock;
  findActiveById: jest.Mock;
  findActiveByName: jest.Mock;
  findAdminCategories: jest.Mock;
  findAdminCategoryDetail: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateStatus: jest.Mock;
  findCategoryUsage: jest.Mock;
  delete: jest.Mock;
}

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: CategoriesRepositoryMock;

  beforeEach(async () => {
    repository = {
      findActive: jest.fn(),
      findActiveBySlug: jest.fn(),
      findActiveById: jest.fn(),
      findActiveByName: jest.fn(),
      findAdminCategories: jest.fn(),
      findAdminCategoryDetail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      findCategoryUsage: jest.fn(),
      delete: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: CategoriesRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  it('normalizes search and returns only the repository projection', async () => {
    const category = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Technology',
      slug: 'technology',
    };
    repository.findActive.mockResolvedValue([category]);

    await expect(service.findAll({ q: '  tech  ' })).resolves.toEqual({
      items: [category],
    });
    expect(repository.findActive).toHaveBeenCalledWith({ q: 'tech' });
    expect(category).not.toHaveProperty('isActive');
    expect(category).not.toHaveProperty('displayOrder');
  });

  it('omits an empty normalized search when called outside the HTTP DTO boundary', async () => {
    repository.findActive.mockResolvedValue([]);

    await service.findAll({ q: '   ' });

    expect(repository.findActive).toHaveBeenCalledWith({});
  });

  it('normalizes a slug and returns an active category', async () => {
    const category = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Technology',
      slug: 'technology',
    };
    repository.findActiveBySlug.mockResolvedValue(category);

    await expect(service.findOneBySlug('  TECHNOLOGY  ')).resolves.toEqual({
      category,
    });
    expect(repository.findActiveBySlug).toHaveBeenCalledWith('technology');
  });

  it.each(['unknown category', 'inactive category'])(
    'returns the same not-found error for an %s',
    async () => {
      repository.findActiveBySlug.mockResolvedValue(null);

      await expect(service.findOneBySlug('hidden')).rejects.toThrow(
        new NotFoundException('Category not found'),
      );
    },
  );

  it('requires an active category for article writes', async () => {
    repository.findActiveById.mockResolvedValue({
      id: 'category-id',
      name: 'Technology',
      slug: 'technology',
    });

    await expect(
      service.requireActiveCategory('category-id'),
    ).resolves.toBeUndefined();
    expect(repository.findActiveById).toHaveBeenCalledWith('category-id');
  });

  it('rejects missing or inactive categories for article writes', async () => {
    repository.findActiveById.mockResolvedValue(null);

    await expect(service.requireActiveCategory('missing')).rejects.toThrow(
      new NotFoundException('Active category not found'),
    );
  });

  it('resolves an import category by its active slug', async () => {
    repository.findActiveBySlug.mockResolvedValue({
      id: 'technology-id',
      name: 'Technology',
      slug: 'technology',
    });

    await expect(
      service.resolveOrCreateImportCategory(
        'admin-id',
        ' technology ',
        'Technology',
      ),
    ).resolves.toBe('technology-id');
    expect(repository.findActiveBySlug).toHaveBeenCalledWith('technology');
    expect(repository.findActiveByName).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('resolves an import category by its active name when its slug differs', async () => {
    repository.findActiveBySlug.mockResolvedValue(null);
    repository.findActiveByName.mockResolvedValue({
      id: 'technology-id',
      name: 'Technology',
      slug: 'tech',
    });

    await expect(
      service.resolveOrCreateImportCategory(
        'admin-id',
        'technology',
        ' Technology ',
      ),
    ).resolves.toBe('technology-id');
    expect(repository.findActiveByName).toHaveBeenCalledWith('Technology');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates an active import category with normalized section data', async () => {
    repository.findActiveBySlug.mockResolvedValue(null);
    repository.findActiveByName.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      id: 'environment-id',
      name: 'Environment',
      slug: 'environment',
    });

    await expect(
      service.resolveOrCreateImportCategory(
        'admin-id',
        'environment',
        ' Environment ',
      ),
    ).resolves.toBe('environment-id');
    expect(repository.create).toHaveBeenCalledWith({
      name: 'Environment',
      slug: 'environment',
      isActive: true,
      displayOrder: 0,
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });
  });

  it('normalizes admin search and maps pagination metadata', async () => {
    repository.findAdminCategories.mockResolvedValue({
      items: [],
      total: 41,
    });

    await expect(
      service.findAllAdmin({
        page: 2,
        limit: 20,
        q: '  tech  ',
        isActive: false,
      }),
    ).resolves.toEqual({
      items: [],
      meta: { page: 2, limit: 20, total: 41, totalPages: 3 },
    });
    expect(repository.findAdminCategories).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      q: 'tech',
      isActive: false,
    });
  });

  it('returns admin detail with articleCount and maps a missing category', async () => {
    const detail = {
      category: {
        id: 'category-id',
        name: 'Technology',
        slug: 'technology',
        description: null,
        isActive: false,
        displayOrder: 1,
        createdAt: new Date('2026-07-22T10:00:00Z'),
        updatedAt: new Date('2026-07-22T10:00:00Z'),
      },
      articleCount: 3,
    };
    repository.findAdminCategoryDetail.mockResolvedValueOnce(detail);

    await expect(service.findOneAdmin('category-id')).resolves.toEqual(detail);
    expect(detail).not.toHaveProperty('article');

    repository.findAdminCategoryDetail.mockResolvedValueOnce(null);
    await expect(service.findOneAdmin('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('normalizes create input, applies defaults, and derives audit IDs from the caller', async () => {
    const category = {
      id: 'category-id',
      name: 'Technology',
      slug: 'technology',
    };
    repository.create.mockResolvedValue(category);

    await expect(
      service.create('admin-id', {
        name: '  Technology  ',
        slug: '  TECHNOLOGY  ',
      }),
    ).resolves.toEqual({ category });
    expect(repository.create).toHaveBeenCalledWith({
      name: 'Technology',
      slug: 'technology',
      isActive: true,
      displayOrder: 0,
      createdByUserId: 'admin-id',
      updatedByUserId: 'admin-id',
    });
  });

  it('maps a concurrent create slug violation to conflict', async () => {
    repository.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create('admin-id', { name: 'Technology', slug: 'technology' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('partially updates supplied fields and the updater audit ID', async () => {
    const category = {
      id: 'category-id',
      name: 'Updated',
      slug: 'technology',
    };
    repository.update.mockResolvedValue(category);

    await expect(
      service.update('admin-id', 'category-id', { name: '  Updated  ' }),
    ).resolves.toEqual({ category });
    expect(repository.update).toHaveBeenCalledWith('category-id', {
      name: 'Updated',
      updatedByUserId: 'admin-id',
    });
  });

  it('allows an unchanged slug to pass through to the database update', async () => {
    repository.update.mockResolvedValue({
      id: 'category-id',
      name: 'Technology',
      slug: 'technology',
    });

    await service.update('admin-id', 'category-id', { slug: 'TECHNOLOGY' });

    expect(repository.update).toHaveBeenCalledWith('category-id', {
      slug: 'technology',
      updatedByUserId: 'admin-id',
    });
  });

  it('rejects an empty update before calling the repository', async () => {
    await expect(
      service.update('admin-id', 'category-id', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each([
    ['duplicate slug', { code: 'P2002' }, ConflictException],
    ['missing category', { code: 'P2025' }, NotFoundException],
  ] as const)('maps update %s', async (_case, error, exception) => {
    repository.update.mockRejectedValue(error);

    await expect(
      service.update('admin-id', 'category-id', { slug: 'technology' }),
    ).rejects.toBeInstanceOf(exception);
  });

  it.each([
    ['activates an inactive category', true],
    ['deactivates an active category', false],
    ['treats the same status as an idempotent success', true],
  ] as const)('%s and records the acting admin', async (_case, isActive) => {
    repository.updateStatus.mockResolvedValue({
      id: 'category-id',
      isActive,
    });

    await expect(
      service.updateStatus('admin-id', 'category-id', { isActive }),
    ).resolves.toEqual({ id: 'category-id', isActive });
    expect(repository.updateStatus).toHaveBeenCalledWith('category-id', {
      isActive,
      updatedByUserId: 'admin-id',
    });
    expect(JSON.stringify(repository.updateStatus.mock.calls[0])).not.toContain(
      'articles',
    );
  });

  it('maps a missing status target to not found', async () => {
    repository.updateStatus.mockRejectedValue({ code: 'P2025' });

    await expect(
      service.updateStatus('admin-id', 'category-id', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an unused category and returns no data', async () => {
    repository.findCategoryUsage.mockResolvedValue({
      id: 'category-id',
      articleCount: 0,
    });
    repository.delete.mockResolvedValue(undefined);

    await expect(
      service.delete('admin-id', 'category-id'),
    ).resolves.toBeUndefined();
    expect(repository.delete).toHaveBeenCalledWith('category-id');
  });

  it('maps a missing delete target to not found without deleting', async () => {
    repository.findCategoryUsage.mockResolvedValue(null);

    await expect(
      service.delete('admin-id', 'category-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('blocks deletion when the category is already used', async () => {
    repository.findCategoryUsage.mockResolvedValue({
      id: 'category-id',
      articleCount: 1,
    });

    await expect(service.delete('admin-id', 'category-id')).rejects.toThrow(
      new ConflictException(
        'Category is used by articles; deactivate it instead',
      ),
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('maps a delete-time foreign-key race to conflict', async () => {
    repository.findCategoryUsage.mockResolvedValue({
      id: 'category-id',
      articleCount: 0,
    });
    repository.delete.mockRejectedValue({ code: 'P2003' });

    await expect(
      service.delete('admin-id', 'category-id'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a delete-time missing record race to not found', async () => {
    repository.findCategoryUsage.mockResolvedValue({
      id: 'category-id',
      articleCount: 0,
    });
    repository.delete.mockRejectedValue({ code: 'P2025' });

    await expect(
      service.delete('admin-id', 'category-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
