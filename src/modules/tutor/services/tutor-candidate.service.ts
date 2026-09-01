import { Injectable } from '@nestjs/common';
import {
  type FsrsCardState,
  type CefrLevel,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Hard ceiling on how many candidates are fetched in one pool query. */
const CANDIDATE_POOL_LIMIT = 50;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Minimal fields of UserVocabulary returned from the candidate pool query. */
export interface CandidateVocab {
  id: string;
  userId: string;

  // FSRS card state
  fsrsState: FsrsCardState;
  fsrsStability: number | null;
  fsrsDifficulty: number | null;
  fsrsScheduledDays: number;
  fsrsLearningSteps: number;
  reviewCount: number;
  lapseCount: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;

  // Vocabulary snapshot (needed by AI service to generate questions)
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedCefrLevel: CefrLevel;
  savedMeaningVi: string;
  savedExamples: unknown;

  // IDs for Task 5 to fetch sentence/term context
  articleSentenceTermId: string;
  sentenceId: string;
}

// ---------------------------------------------------------------------------
// Prisma select shape
// ---------------------------------------------------------------------------

const candidateSelect = {
  id: true,
  userId: true,
  fsrsState: true,
  fsrsStability: true,
  fsrsDifficulty: true,
  fsrsScheduledDays: true,
  fsrsLearningSteps: true,
  reviewCount: true,
  lapseCount: true,
  nextReviewAt: true,
  lastReviewedAt: true,
  savedWordDisplay: true,
  savedLemma: true,
  savedPartOfSpeech: true,
  savedCefrLevel: true,
  savedMeaningVi: true,
  savedExamples: true,
  articleSentenceTermId: true,
  articleSentenceTerm: {
    select: {
      sentenceId: true,
    },
  },
} as const;

// Raw result from Prisma before we flatten it
type RawCandidateRow = {
  articleSentenceTerm: { sentenceId: string };
} & Omit<CandidateVocab, 'sentenceId'>;

const flattenRow = (row: RawCandidateRow): CandidateVocab => ({
  id: row.id,
  userId: row.userId,
  fsrsState: row.fsrsState,
  fsrsStability: row.fsrsStability,
  fsrsDifficulty: row.fsrsDifficulty,
  fsrsScheduledDays: row.fsrsScheduledDays,
  fsrsLearningSteps: row.fsrsLearningSteps,
  reviewCount: row.reviewCount,
  lapseCount: row.lapseCount,
  nextReviewAt: row.nextReviewAt,
  lastReviewedAt: row.lastReviewedAt,
  savedWordDisplay: row.savedWordDisplay,
  savedLemma: row.savedLemma,
  savedPartOfSpeech: row.savedPartOfSpeech,
  savedCefrLevel: row.savedCefrLevel,
  savedMeaningVi: row.savedMeaningVi,
  savedExamples: row.savedExamples,
  articleSentenceTermId: row.articleSentenceTermId,
  sentenceId: row.articleSentenceTerm.sentenceId,
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Provides the candidate vocabulary pool for a tutor session.
 *
 * Priority order (each bucket is bounded by CANDIDATE_POOL_LIMIT):
 *   1. RELEARNING with nextReviewAt <= now
 *   2. LEARNING  with nextReviewAt <= now
 *   3. REVIEW    due or overdue (nextReviewAt <= now, oldest first)
 *   4. NEW       (oldest savedAt first)
 *
 * Within each bucket, tie-breaker is: nextReviewAt ASC, savedAt ASC, id ASC.
 * This guarantees a deterministic, stable ordering across requests.
 *
 * "Weak recent items" are omitted at MVP — only the 4 FSRS states are used.
 */
@Injectable()
export class TutorCandidateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns a bounded, deterministically-ordered candidate pool for the
   * given user at `now`. The caller is responsible for slicing the pool
   * according to `targetActivityCount` and `newWordTarget`.
   *
   * The query always scopes to `userId` and never runs without a `take`.
   */
  async getCandidatePool(
    userId: string,
    now: Date,
    limit: number = CANDIDATE_POOL_LIMIT,
  ): Promise<CandidateVocab[]> {
    const boundedLimit = Math.min(limit, CANDIDATE_POOL_LIMIT);
    const tieBreaker = [
      { nextReviewAt: 'asc' as const },
      { savedAt: 'asc' as const },
      { id: 'asc' as const },
    ];

    const [relearning, learning, review, newWords] = await Promise.all([
      // Bucket 1: RELEARNING due
      this.prisma.userVocabulary.findMany({
        where: { userId, fsrsState: 'RELEARNING', nextReviewAt: { lte: now } },
        orderBy: tieBreaker,
        take: boundedLimit,
        select: candidateSelect,
      }),

      // Bucket 2: LEARNING due
      this.prisma.userVocabulary.findMany({
        where: { userId, fsrsState: 'LEARNING', nextReviewAt: { lte: now } },
        orderBy: tieBreaker,
        take: boundedLimit,
        select: candidateSelect,
      }),

      // Bucket 3: REVIEW due or overdue
      this.prisma.userVocabulary.findMany({
        where: { userId, fsrsState: 'REVIEW', nextReviewAt: { lte: now } },
        orderBy: tieBreaker,
        take: boundedLimit,
        select: candidateSelect,
      }),

      // Bucket 4: NEW words — ordered by savedAt so oldest unseen words come first
      this.prisma.userVocabulary.findMany({
        where: { userId, fsrsState: 'NEW' },
        orderBy: [{ savedAt: 'asc' }, { id: 'asc' }],
        take: boundedLimit,
        select: candidateSelect,
      }),
    ]);

    const allCandidates = [
      ...relearning,
      ...learning,
      ...review,
      ...newWords,
    ] as RawCandidateRow[];

    if (allCandidates.length === 0) {
      const fallback = (await this.prisma.userVocabulary.findMany({
        where: { userId },
        orderBy: [{ lastReviewedAt: 'asc' }, { savedAt: 'asc' }, { id: 'asc' }],
        take: boundedLimit,
        select: candidateSelect,
      })) as RawCandidateRow[];
      return fallback.map(flattenRow);
    }

    return allCandidates.slice(0, boundedLimit).map(flattenRow);
  }

  /**
   * Returns the count of NEW vocabulary items for the given user.
   * Used by `TutorFsrsService.calcSessionTargets` to determine `newWordTarget`.
   */
  countNewVocab(userId: string): Promise<number> {
    return this.prisma.userVocabulary.count({
      where: { userId, fsrsState: 'NEW' },
    });
  }
}
