import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminCategoryListQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './dto/admin-category.dto';
import type { GetCategoriesQueryDto } from './dto/get-categories-query.dto';
import { normalizeCategorySlug } from './dto/get-categories-query.dto';
import {
  type AdminCategoryDetailRecord,
  type AdminCategoryRecord,
  type CategoryStatusRecord,
  CategoriesRepository,
  type PublicCategoryRecord,
} from './categories.repository';

const hasPrismaCode = (
  error: unknown,
  code: 'P2002' | 'P2003' | 'P2025',
): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

export interface AdminCategoryListResponse {
  items: AdminCategoryRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async findAll(
    query: GetCategoriesQueryDto,
  ): Promise<{ items: PublicCategoryRecord[] }> {
    const q = query.q?.trim();
    const items = await this.categoriesRepository.findActive({
      ...(q ? { q } : {}),
    });

    return { items };
  }

  async findOneBySlug(
    slug: string,
  ): Promise<{ category: PublicCategoryRecord }> {
    const normalizedSlug = slug.trim().toLowerCase();
    const category =
      await this.categoriesRepository.findActiveBySlug(normalizedSlug);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return { category };
  }

  async findAllAdmin(
    query: AdminCategoryListQueryDto,
  ): Promise<AdminCategoryListResponse> {
    const q = query.q?.trim();
    const result = await this.categoriesRepository.findAdminCategories({
      page: query.page,
      limit: query.limit,
      ...(q ? { q } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    });

    return {
      items: result.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOneAdmin(categoryId: string): Promise<AdminCategoryDetailRecord> {
    const detail =
      await this.categoriesRepository.findAdminCategoryDetail(categoryId);

    if (!detail) {
      throw new NotFoundException('Category not found');
    }

    return detail;
  }

  async create(
    actingAdminId: string,
    dto: CreateCategoryDto,
  ): Promise<{ category: PublicCategoryRecord }> {
    try {
      const category = await this.categoriesRepository.create({
        name: dto.name.trim(),
        slug: normalizeCategorySlug(dto.slug),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description.trim() }),
        isActive: dto.isActive ?? true,
        displayOrder: dto.displayOrder ?? 0,
        createdByUserId: actingAdminId,
        updatedByUserId: actingAdminId,
      });

      return { category };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async update(
    actingAdminId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<{ category: PublicCategoryRecord }> {
    if (
      dto.name === undefined &&
      dto.slug === undefined &&
      dto.description === undefined &&
      dto.displayOrder === undefined
    ) {
      throw new BadRequestException('At least one category field is required');
    }

    try {
      const category = await this.categoriesRepository.update(categoryId, {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.slug === undefined
          ? {}
          : { slug: normalizeCategorySlug(dto.slug) }),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description.trim() }),
        ...(dto.displayOrder === undefined
          ? {}
          : { displayOrder: dto.displayOrder }),
        updatedByUserId: actingAdminId,
      });

      return { category };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async updateStatus(
    actingAdminId: string,
    categoryId: string,
    dto: UpdateCategoryStatusDto,
  ): Promise<CategoryStatusRecord> {
    try {
      return await this.categoriesRepository.updateStatus(categoryId, {
        isActive: dto.isActive,
        updatedByUserId: actingAdminId,
      });
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async delete(actingAdminId: string, categoryId: string): Promise<void> {
    // There is no surviving category audit record or audit-log subsystem.
    // Keep the verified actor explicit at the service boundary as required.
    void actingAdminId;

    const usage = await this.categoriesRepository.findCategoryUsage(categoryId);
    if (!usage) {
      throw new NotFoundException('Category not found');
    }
    if (usage.articleCount > 0) {
      throw new ConflictException(
        'Category is used by articles; deactivate it instead',
      );
    }

    try {
      await this.categoriesRepository.delete(categoryId);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2003')) {
        throw new ConflictException(
          'Category is used by articles; deactivate it instead',
        );
      }
      this.mapWriteError(error);
    }
  }

  private mapWriteError(error: unknown): never {
    if (hasPrismaCode(error, 'P2002')) {
      throw new ConflictException('Category slug already exists');
    }

    if (hasPrismaCode(error, 'P2025')) {
      throw new NotFoundException('Category not found');
    }

    throw error;
  }
}
