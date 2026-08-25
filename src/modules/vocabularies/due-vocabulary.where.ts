import { Prisma } from '../../../generated/prisma/client';
import { LearningStatus } from '../../../generated/prisma/enums';

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
