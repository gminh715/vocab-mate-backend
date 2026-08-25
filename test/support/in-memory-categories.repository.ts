import { randomUUID } from 'node:crypto';
import type {
  AdminCategoryDetailRecord,
  AdminCategoryListQuery,
  AdminCategoryListResult,
  CreateCategoryInput,
  CategoryStatusRecord,
  CategoryUsageRecord,
  PublicCategoryRecord,
  UpdateCategoryInput,
  UpdateCategoryStatusInput,
} from '../../src/modules/categories/repositories/categories.repository';

class PrismaLikeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface CategoryFixture extends PublicCategoryRecord {
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  updatedByUserId: string;
  articleCount: number;
}

const FIXTURE_ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export class InMemoryCategoriesRepository {
  private categories: CategoryFixture[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    const createdAt = new Date('2026-07-22T10:00:00Z');
    this.categories = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Alpha',
        slug: 'alpha-one',
        description: null,
        isActive: true,
        displayOrder: 1,
        createdAt,
        updatedAt: createdAt,
        createdByUserId: FIXTURE_ADMIN_ID,
        updatedByUserId: FIXTURE_ADMIN_ID,
        articleCount: 0,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Alpha',
        slug: 'alpha-two',
        description: 'Second alpha category',
        isActive: true,
        displayOrder: 1,
        createdAt,
        updatedAt: createdAt,
        createdByUserId: FIXTURE_ADMIN_ID,
        updatedByUserId: FIXTURE_ADMIN_ID,
        articleCount: 0,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Technology',
        slug: 'technology',
        description: 'Technology articles',
        isActive: true,
        displayOrder: 1,
        createdAt,
        updatedAt: createdAt,
        createdByUserId: FIXTURE_ADMIN_ID,
        updatedByUserId: FIXTURE_ADMIN_ID,
        articleCount: 3,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Science',
        slug: 'science',
        description: null,
        isActive: true,
        displayOrder: 2,
        createdAt,
        updatedAt: createdAt,
        createdByUserId: FIXTURE_ADMIN_ID,
        updatedByUserId: FIXTURE_ADMIN_ID,
        articleCount: 1,
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        name: 'Hidden Technology',
        slug: 'hidden-technology',
        description: 'Inactive category',
        isActive: false,
        displayOrder: 0,
        createdAt,
        updatedAt: createdAt,
        createdByUserId: FIXTURE_ADMIN_ID,
        updatedByUserId: FIXTURE_ADMIN_ID,
        articleCount: 2,
      },
    ];
  }

  findActive(query: { q?: string }): Promise<PublicCategoryRecord[]> {
    const q = query.q?.toLowerCase();
    return Promise.resolve(
      this.sort(this.categories)
        .filter((category) => category.isActive)
        .filter((category) => !q || category.name.toLowerCase().includes(q))
        .map((category) => this.toPublic(category)),
    );
  }

  findActiveBySlug(slug: string): Promise<PublicCategoryRecord | null> {
    const category = this.categories.find(
      (candidate) => candidate.isActive && candidate.slug === slug,
    );
    return Promise.resolve(category ? this.toPublic(category) : null);
  }

  findActiveById(categoryId: string): Promise<PublicCategoryRecord | null> {
    const category = this.categories.find(
      (candidate) => candidate.isActive && candidate.id === categoryId,
    );
    return Promise.resolve(category ? this.toPublic(category) : null);
  }

  findAdminCategories(
    query: AdminCategoryListQuery,
  ): Promise<AdminCategoryListResult> {
    const q = query.q?.toLowerCase();
    const filtered = this.sort(this.categories)
      .filter(
        (category) =>
          query.isActive === undefined || category.isActive === query.isActive,
      )
      .filter((category) => !q || category.name.toLowerCase().includes(q));
    const start = (query.page - 1) * query.limit;

    return Promise.resolve({
      items: filtered
        .slice(start, start + query.limit)
        .map((category) => this.toAdmin(category)),
      total: filtered.length,
    });
  }

  findAdminCategoryDetail(
    categoryId: string,
  ): Promise<AdminCategoryDetailRecord | null> {
    const category = this.categories.find(({ id }) => id === categoryId);
    return Promise.resolve(
      category
        ? {
            category: this.toAdmin(category),
            articleCount: category.articleCount,
          }
        : null,
    );
  }

  create(input: CreateCategoryInput): Promise<PublicCategoryRecord> {
    if (this.hasSlug(input.slug)) {
      return Promise.reject(new PrismaLikeError('P2002'));
    }

    const now = new Date();
    const category: CategoryFixture = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      isActive: input.isActive,
      displayOrder: input.displayOrder,
      createdAt: now,
      updatedAt: now,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      articleCount: 0,
    };
    this.categories.push(category);
    return Promise.resolve(this.toPublic(category));
  }

  update(
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<PublicCategoryRecord> {
    const category = this.categories.find(({ id }) => id === categoryId);
    if (!category) {
      return Promise.reject(new PrismaLikeError('P2025'));
    }
    if (input.slug && this.hasSlug(input.slug, categoryId)) {
      return Promise.reject(new PrismaLikeError('P2002'));
    }

    Object.assign(category, input, { updatedAt: new Date() });
    return Promise.resolve(this.toPublic(category));
  }

  updateStatus(
    categoryId: string,
    input: UpdateCategoryStatusInput,
  ): Promise<CategoryStatusRecord> {
    const category = this.categories.find(({ id }) => id === categoryId);
    if (!category) {
      return Promise.reject(new PrismaLikeError('P2025'));
    }

    category.isActive = input.isActive;
    category.updatedByUserId = input.updatedByUserId;
    category.updatedAt = new Date();
    return Promise.resolve({ id: category.id, isActive: category.isActive });
  }

  findCategoryUsage(categoryId: string): Promise<CategoryUsageRecord | null> {
    const category = this.categories.find(({ id }) => id === categoryId);
    return Promise.resolve(
      category
        ? { id: category.id, articleCount: category.articleCount }
        : null,
    );
  }

  delete(categoryId: string): Promise<void> {
    const index = this.categories.findIndex(({ id }) => id === categoryId);
    if (index < 0) {
      return Promise.reject(new PrismaLikeError('P2025'));
    }
    if (this.categories[index].articleCount > 0) {
      return Promise.reject(new PrismaLikeError('P2003'));
    }

    this.categories.splice(index, 1);
    return Promise.resolve();
  }

  private hasSlug(slug: string, excludedId?: string): boolean {
    return this.categories.some(
      (category) =>
        category.id !== excludedId &&
        category.slug.toLowerCase() === slug.toLowerCase(),
    );
  }

  private sort(categories: CategoryFixture[]): CategoryFixture[] {
    return [...categories].sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
  }

  private toPublic(category: CategoryFixture): PublicCategoryRecord {
    return { id: category.id, name: category.name, slug: category.slug };
  }

  private toAdmin(category: CategoryFixture) {
    return {
      ...this.toPublic(category),
      description: category.description,
      isActive: category.isActive,
      displayOrder: category.displayOrder,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
