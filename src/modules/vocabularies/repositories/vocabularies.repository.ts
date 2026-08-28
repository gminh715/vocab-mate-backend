import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { type CefrLevel } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { VocabularySort } from '../dto/vocabulary-request.dto';

export interface VocabularyListQuery {
  page: number;
  limit: number;
  q?: string;
  cefrLevel?: CefrLevel;
  collectionId?: string;
  sort: VocabularySort;
}

export interface CreateVocabularySnapshotInput {
  articleSentenceTermId: string;
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedIpa: string | null;
  savedCefrLevel: CefrLevel;
  savedMeaningVi: string;
  definitionEn: string;
  savedExamples: Prisma.InputJsonValue;
}

export class InvalidVocabularyCollectionsError extends Error {
  constructor() {
    super('One or more vocabulary collections are inaccessible');
    this.name = InvalidVocabularyCollectionsError.name;
  }
}

const collectionSelect = {
  id: true,
  name: true,
} as const;

const collectionItemsOrderBy: Prisma.VocabularyCollectionItemOrderByWithRelationInput[] =
  [{ addedAt: 'asc' }, { collectionId: 'asc' }];

const collectionItemsSelect = (userId: string) =>
  ({
    where: {
      collection: {
        is: {
          userId,
        },
      },
    },
    orderBy: collectionItemsOrderBy,
    select: {
      addedAt: true,
      collection: {
        select: collectionSelect,
      },
    },
  }) as const;

export const vocabularySnapshotListSelect = {
  id: true,
  articleSentenceTermId: true,
  savedWordDisplay: true,
  savedLemma: true,
  savedPartOfSpeech: true,
  savedIpa: true,
  savedCefrLevel: true,
  savedMeaningVi: true,
  definitionEn: true,
  savedAt: true,
  createdAt: true,
} as const;

const vocabularyListSelect = (userId: string) =>
  ({
    ...vocabularySnapshotListSelect,
    collectionItems: collectionItemsSelect(userId),
  }) as const;

const sourceArticleSelect = {
  id: true,
  slug: true,
  title: true,
  thumbnailUrl: true,
  sourceName: true,
  sourceUrl: true,
} as const;

const vocabularyDetailSelect = (userId: string) =>
  ({
    ...vocabularyListSelect(userId),
    savedExamples: true,
    articleSentenceTerm: {
      select: {
        sentence: {
          select: {
            article: {
              select: sourceArticleSelect,
            },
          },
        },
      },
    },
  }) as const;

@Injectable()
export class VocabulariesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: VocabularyListQuery) {
    const filters: Prisma.UserVocabularyWhereInput[] = [];
    if (query.q) {
      filters.push({
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
    if (query.cefrLevel) {
      filters.push({ savedCefrLevel: query.cefrLevel });
    }
    if (query.collectionId) {
      filters.push({
        collectionItems: {
          some: {
            collectionId: query.collectionId,
            collection: {
              is: {
                userId,
              },
            },
          },
        },
      });
    }
    const where: Prisma.UserVocabularyWhereInput = {
      userId,
      ...(filters.length > 0 ? { AND: filters } : {}),
    };
    const direction = query.sort === VocabularySort.OLDEST ? 'asc' : 'desc';
    const [items, total] = await this.prisma.$transaction([
      this.prisma.userVocabulary.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ savedAt: direction }, { id: 'asc' }],
        select: vocabularyListSelect(userId),
      }),
      this.prisma.userVocabulary.count({ where }),
    ]);

    return { items, total };
  }

  findOwnedById(userId: string, userVocabularyId: string) {
    return this.prisma.userVocabulary.findFirst({
      where: {
        id: userVocabularyId,
        userId,
      },
      select: vocabularyDetailSelect(userId),
    });
  }

  createWithCollections(
    userId: string,
    input: CreateVocabularySnapshotInput,
    collectionIds: string[],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      if (collectionIds.length > 0) {
        const ownedCollections =
          await transaction.vocabularyCollection.findMany({
            where: {
              id: { in: collectionIds },
              userId,
            },
            select: { id: true },
          });
        if (ownedCollections.length !== collectionIds.length) {
          throw new InvalidVocabularyCollectionsError();
        }
      }

      return transaction.userVocabulary.create({
        data: {
          userId,
          ...input,
          ...(collectionIds.length > 0
            ? {
                collectionItems: {
                  create: collectionIds.map((collectionId) => ({
                    collectionId,
                  })),
                },
              }
            : {}),
        },
        select: vocabularyDetailSelect(userId),
      });
    });
  }

  async deleteOwned(userId: string, id: string) {
    const result = await this.prisma.userVocabulary.deleteMany({
      where: { id, userId },
    });
    return result.count === 1;
  }
}
