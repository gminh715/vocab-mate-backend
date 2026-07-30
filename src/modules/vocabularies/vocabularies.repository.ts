import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  type CefrLevel,
  LearningStatus,
  type LearningStatus as LearningStatusType,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { VocabularySort } from './dto/vocabulary-request.dto';

export interface VocabularyListQuery {
  page: number;
  limit: number;
  q?: string;
  learningStatus?: LearningStatusType;
  cefrLevel?: CefrLevel;
  collectionId?: string;
  dueOnly?: boolean;
  sort: VocabularySort;
}

export interface CreateVocabularySnapshotInput {
  articleSentenceTermId: string;
  personalNote?: string;
  learningStatus: LearningStatusType;
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedIpa: string | null;
  savedCefrLevel: CefrLevel;
  savedContextSentence: string;
  savedContextTranslationVi: string;
  savedMeaningVi: string;
  savedExplanation: string | null;
  savedExamples: Prisma.InputJsonValue;
  lastReviewedAt: null;
  nextReviewAt: null;
  reviewIntervalDays: null;
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
  description: true,
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

export const dueVocabularyWhere = (
  now: Date,
): Prisma.UserVocabularyWhereInput => ({
  learningStatus: {
    in: [LearningStatus.NEW, LearningStatus.LEARNING, LearningStatus.REVIEWING],
  },
  OR: [
    { nextReviewAt: { lte: now } },
    {
      learningStatus: LearningStatus.NEW,
      nextReviewAt: null,
    },
  ],
});

export const vocabularySnapshotListSelect = {
  id: true,
  articleSentenceTermId: true,
  learningStatus: true,
  personalNote: true,
  savedWordDisplay: true,
  savedLemma: true,
  savedPartOfSpeech: true,
  savedIpa: true,
  savedCefrLevel: true,
  savedMeaningVi: true,
  savedAt: true,
  nextReviewAt: true,
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
    savedContextSentence: true,
    savedContextTranslationVi: true,
    savedExplanation: true,
    savedExamples: true,
    lastReviewedAt: true,
    reviewIntervalDays: true,
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

  async list(userId: string, query: VocabularyListQuery, now: Date) {
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
          {
            personalNote: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
        ],
      });
    }
    if (query.learningStatus) {
      filters.push({ learningStatus: query.learningStatus });
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
    if (query.dueOnly) {
      filters.push(dueVocabularyWhere(now));
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

  updatePersonalNote(userId: string, id: string, note: string | null) {
    return this.prisma.userVocabulary.updateMany({
      where: { id, userId },
      data: { personalNote: note },
    });
  }

  updateLearningStatus(
    userId: string,
    id: string,
    learningStatus: LearningStatusType,
  ) {
    return this.prisma.userVocabulary.updateMany({
      where: { id, userId },
      data: { learningStatus },
    });
  }

  async deleteOwned(userId: string, id: string) {
    const record = await this.prisma.userVocabulary.findFirst({
      where: { id, userId },
    });
    if (!record) return false;

    await this.prisma.userVocabulary.delete({
      where: { id },
    });
    return true;
  }
}
