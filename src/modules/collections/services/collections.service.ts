import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AddCollectionItemsDto,
  CreateCollectionDto,
  GetCollectionItemsQueryDto,
  GetCollectionsQueryDto,
  UpdateCollectionDto,
} from '../dto/collection-request.dto';
import {
  CollectionNotAccessibleError,
  CollectionsRepository,
  CollectionVocabulariesNotAccessibleError,
} from '../repositories/collections.repository';

const hasPrismaCode = (error: unknown, code: 'P2002' | 'P2003'): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

@Injectable()
export class CollectionsService {
  constructor(private readonly collectionsRepository: CollectionsRepository) {}

  async findAll(userId: string, query: GetCollectionsQueryDto) {
    const q = query.q?.trim();
    const result = await this.collectionsRepository.list(userId, {
      page: query.page,
      limit: query.limit,
      ...(q ? { q } : {}),
    });

    return {
      items: result.items.map(({ _count, ...collection }) => ({
        ...collection,
        vocabularyCount: _count.items,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOne(userId: string, collectionId: string) {
    const result = await this.collectionsRepository.findOwnedDetail(
      userId,
      collectionId,
    );
    if (!result) {
      throw new NotFoundException('Collection not found');
    }

    const { _count, ...collection } = result;
    return {
      collection,
      vocabularyCount: _count.items,
    };
  }

  async create(userId: string, dto: CreateCollectionDto) {
    try {
      const collection = await this.collectionsRepository.create(userId, {
        name: dto.name.trim(),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description.trim() }),
      });

      return { collection };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async update(userId: string, collectionId: string, dto: UpdateCollectionDto) {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException(
        'At least one collection field is required',
      );
    }

    try {
      const collection = await this.collectionsRepository.updateOwned(
        userId,
        collectionId,
        {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined
            ? {}
            : {
                description:
                  dto.description === null ? null : dto.description.trim(),
              }),
        },
      );
      if (!collection) {
        throw new NotFoundException('Collection not found');
      }

      return { collection };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async delete(userId: string, collectionId: string): Promise<void> {
    const deleted = await this.collectionsRepository.deleteOwned(
      userId,
      collectionId,
    );
    if (!deleted) {
      throw new NotFoundException('Collection not found');
    }
  }

  async findItems(
    userId: string,
    collectionId: string,
    query: GetCollectionItemsQueryDto,
  ) {
    const collection = await this.collectionsRepository.findOwnedId(
      userId,
      collectionId,
    );
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    const q = query.q?.trim();
    const result = await this.collectionsRepository.listItems(
      userId,
      collectionId,
      {
        page: query.page,
        limit: query.limit,
        sort: query.sort,
        ...(q ? { q } : {}),
        ...(query.learningStatus
          ? { learningStatus: query.learningStatus }
          : {}),
      },
    );

    return {
      items: result.items.map(({ addedAt, userVocabulary }) => ({
        ...userVocabulary,
        addedAt,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async addItems(
    userId: string,
    collectionId: string,
    dto: AddCollectionItemsDto,
  ) {
    const originalCount = dto.userVocabularyIds.length;
    const uniqueIds = [
      ...new Set(dto.userVocabularyIds.map((id) => id.toLowerCase())),
    ];

    try {
      const result = await this.collectionsRepository.addItems(
        userId,
        collectionId,
        uniqueIds,
      );

      return {
        addedCount: result.count,
        skippedCount: originalCount - result.count,
      };
    } catch (error: unknown) {
      if (error instanceof CollectionNotAccessibleError) {
        throw new NotFoundException('Collection not found');
      }
      if (
        error instanceof CollectionVocabulariesNotAccessibleError ||
        hasPrismaCode(error, 'P2003')
      ) {
        throw new UnprocessableEntityException(
          'One or more saved vocabularies are unavailable',
        );
      }
      throw error;
    }
  }

  async deleteItem(
    userId: string,
    collectionId: string,
    userVocabularyId: string,
  ): Promise<void> {
    const deleted = await this.collectionsRepository.deleteOwnedItem(
      userId,
      collectionId,
      userVocabularyId,
    );
    if (!deleted) {
      throw new NotFoundException('Collection item not found');
    }
  }

  private mapWriteError(error: unknown): never {
    if (error instanceof NotFoundException) {
      throw error;
    }
    if (hasPrismaCode(error, 'P2002')) {
      throw new ConflictException('Collection name already exists');
    }
    throw error;
  }
}
