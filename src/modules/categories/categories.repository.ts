import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface PublicCategoryRecord {
  id: string;
  name: string;
  slug: string;
}

export interface FindActiveCategoriesQuery {
  q?: string;
}

export interface AdminCategoryRecord extends PublicCategoryRecord {
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminCategoryListQuery {
  page: number;
  limit: number;
  q?: string;
  isActive?: boolean;
}

export interface AdminCategoryListResult {
  items: AdminCategoryRecord[];
  total: number;
}

export interface AdminCategoryDetailRecord {
  category: AdminCategoryRecord;
  articleCount: number;
}

export interface CategoryStatusRecord {
  id: string;
  isActive: boolean;
}

export interface CategoryUsageRecord {
  id: string;
  articleCount: number;
}

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
  createdByUserId: string;
  updatedByUserId: string;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string;
  displayOrder?: number;
  updatedByUserId: string;
}

export interface UpdateCategoryStatusInput {
  isActive: boolean;
  updatedByUserId: string;
}

const publicCategorySelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const adminCategorySelect = {
  ...publicCategorySelect,
  description: true,
  isActive: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(
    query: FindActiveCategoriesQuery,
  ): Promise<PublicCategoryRecord[]> {
    return this.prisma.category.findMany({
      where: {
        isActive: true,
        ...(query.q
          ? {
              name: { contains: query.q, mode: 'insensitive' as const },
            }
          : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: publicCategorySelect,
    });
  }

  findActiveBySlug(slug: string): Promise<PublicCategoryRecord | null> {
    return this.prisma.category.findFirst({
      where: { slug, isActive: true },
      select: publicCategorySelect,
    });
  }

  findActiveById(categoryId: string): Promise<PublicCategoryRecord | null> {
    return this.prisma.category.findFirst({
      where: { id: categoryId, isActive: true },
      select: publicCategorySelect,
    });
  }

  findActiveByName(name: string): Promise<PublicCategoryRecord | null> {
    return this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        isActive: true,
      },
      select: publicCategorySelect,
    });
  }

  async findAdminCategories(
    query: AdminCategoryListQuery,
  ): Promise<AdminCategoryListResult> {
    const where: Prisma.CategoryWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: adminCategorySelect,
      }),
      this.prisma.category.count({ where }),
    ]);

    return { items, total };
  }

  async findAdminCategoryDetail(
    categoryId: string,
  ): Promise<AdminCategoryDetailRecord | null> {
    const result = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        ...adminCategorySelect,
        _count: { select: { articles: true } },
      },
    });

    if (!result) {
      return null;
    }

    const { _count, ...category } = result;
    return { category, articleCount: _count.articles };
  }

  create(input: CreateCategoryInput): Promise<PublicCategoryRecord> {
    return this.prisma.category.create({
      data: input,
      select: publicCategorySelect,
    });
  }

  update(
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<PublicCategoryRecord> {
    return this.prisma.category.update({
      where: { id: categoryId },
      data: input,
      select: publicCategorySelect,
    });
  }

  updateStatus(
    categoryId: string,
    input: UpdateCategoryStatusInput,
  ): Promise<CategoryStatusRecord> {
    return this.prisma.category.update({
      where: { id: categoryId },
      data: input,
      select: { id: true, isActive: true },
    });
  }

  async findCategoryUsage(
    categoryId: string,
  ): Promise<CategoryUsageRecord | null> {
    const result = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, _count: { select: { articles: true } } },
    });

    return result
      ? { id: result.id, articleCount: result._count.articles }
      : null;
  }

  async delete(categoryId: string): Promise<void> {
    await this.prisma.category.delete({
      where: { id: categoryId },
      select: { id: true },
    });
  }
}
