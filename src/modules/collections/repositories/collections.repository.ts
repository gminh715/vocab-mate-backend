import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import type { LearningStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { CollectionItemSort } from '../dto/collection-request.dto';

export interface CollectionListQuery {
  page: number;
  limit: number;
  q?: string;
}

export interface CollectionRecord {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCollectionInput {
  name: string;
}

export interface UpdateCollectionInput {
  name?: string;
}

export interface CollectionItemsQuery {
  page: number;
  limit: number;
  q?: string;
  learningStatus?: LearningStatus;
  sort: CollectionItemSort;
}

export class CollectionNotAccessibleError extends Error {
  constructor() {
    super('Collection is inaccessible');
    this.name = CollectionNotAccessibleError.name;
  }
}

export class CollectionVocabulariesNotAccessibleError extends Error {
  constructor() {
    super('One or more saved vocabularies are inaccessible');
    this.name = CollectionVocabulariesNotAccessibleError.name;
  }
}

const collectionSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

const collectionVocabularySnapshotSelect = {
  id: true,
  articleSentenceTermId: true,
  learningStatus: true,
  savedWordDisplay: true,
  savedLemma: true,
  savedPartOfSpeech: true,
  savedIpa: true,
  savedCefrLevel: true,
  savedMeaningVi: true,
  savedAt: true,
  nextReviewAt: true,
} as const;

@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: CollectionListQuery) {
    const where: Prisma.VocabularyCollectionWhereInput = {
      userId,
      ...(query.q
        ? {
            name: {
              contains: query.q,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vocabularyCollection.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          ...collectionSelect,
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      this.prisma.vocabularyCollection.count({ where }),
    ]);

    return { items, total };
  }

  findOwnedDetail(userId: string, collectionId: string) {
    return this.prisma.vocabularyCollection.findFirst({
      where: {
        id: collectionId,
        userId,
      },
      select: {
        ...collectionSelect,
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
  }

  findOwnedId(userId: string, collectionId: string) {
    return this.prisma.vocabularyCollection.findFirst({
      where: {
        id: collectionId,
        userId,
      },
      select: {
        id: true,
      },
    });
  }

  create(userId: string, input: CreateCollectionInput) {
    return this.prisma.vocabularyCollection.create({
      data: {
        userId,
        ...input,
      },
      select: collectionSelect,
    });
  }

  async updateOwned(
    userId: string,
    collectionId: string,
    input: UpdateCollectionInput,
  ): Promise<CollectionRecord | null> {
    const rows = await this.prisma.vocabularyCollection.updateManyAndReturn({
      where: {
        id: collectionId,
        userId,
      },
      data: input,
      select: collectionSelect,
    });

    return rows[0] ?? null;
  }

  async deleteOwned(userId: string, collectionId: string): Promise<boolean> {
    const result = await this.prisma.vocabularyCollection.deleteMany({
      where: {
        id: collectionId,
        userId,
      },
    });

    return result.count === 1;
  }

  async listItems(
    userId: string,
    collectionId: string,
    query: CollectionItemsQuery,
  ) {
    const vocabularyFilters: Prisma.UserVocabularyWhereInput[] = [];
    if (query.q) {
      vocabularyFilters.push({
        OR: [
          {
            savedWordDisplay: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            savedLemma: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            savedMeaningVi: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
        ],
      });
    }
    if (query.learningStatus) {
      vocabularyFilters.push({ learningStatus: query.learningStatus });
    }

    const where: Prisma.VocabularyCollectionItemWhereInput = {
      collectionId,
      collection: {
        is: {
          userId,
        },
      },
      userVocabulary: {
        is: {
          userId,
          ...(vocabularyFilters.length > 0 ? { AND: vocabularyFilters } : {}),
        },
      },
    };
    const direction = query.sort === CollectionItemSort.OLDEST ? 'asc' : 'desc';
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vocabularyCollectionItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          {
            addedAt: direction,
          },
          {
            userVocabularyId: 'asc',
          },
        ],
        select: {
          addedAt: true,
          userVocabulary: {
            select: collectionVocabularySnapshotSelect,
          },
        },
      }),
      this.prisma.vocabularyCollectionItem.count({ where }),
    ]);

    return { items, total };
  }

  addItems(userId: string, collectionId: string, userVocabularyIds: string[]) {
    return this.prisma.$transaction(async (transaction) => {
      const collection = await transaction.vocabularyCollection.findFirst({
        where: {
          id: collectionId,
          userId,
        },
        select: {
          id: true,
        },
      });
      if (!collection) {
        throw new CollectionNotAccessibleError();
      }

      const ownedVocabularies = await transaction.userVocabulary.findMany({
        where: {
          id: {
            in: userVocabularyIds,
          },
          userId,
        },
        select: {
          id: true,
        },
      });
      if (ownedVocabularies.length !== userVocabularyIds.length) {
        throw new CollectionVocabulariesNotAccessibleError();
      }

      return transaction.vocabularyCollectionItem.createMany({
        data: userVocabularyIds.map((userVocabularyId) => ({
          collectionId,
          userVocabularyId,
        })),
        skipDuplicates: true,
      });
    });
  }

  async deleteOwnedItem(
    userId: string,
    collectionId: string,
    userVocabularyId: string,
  ): Promise<boolean> {
    const result = await this.prisma.vocabularyCollectionItem.deleteMany({
      where: {
        collectionId,
        userVocabularyId,
        collection: {
          is: {
            userId,
          },
        },
        userVocabulary: {
          is: {
            userId,
          },
        },
      },
    });

    return result.count === 1;
  }
}
