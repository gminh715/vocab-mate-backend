import { Injectable } from '@nestjs/common';
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  State,
  type Card,
  type Grade,
  type RecordLog,
  type RecordLogItem,
} from 'ts-fsrs';
import { type FsrsCardState } from '../../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Internal constants — not exported; only this service owns these values
// ---------------------------------------------------------------------------

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const SECONDS_PER_ACTIVITY = 45;
const MIN_ACTIVITY_COUNT = 3;
const MAX_ACTIVITY_COUNT = 40;
const NEW_WORD_RATIO = 0.2;
const REQUEST_RETENTION = 0.9;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Fields from UserVocabulary needed to reconstruct an FSRS card. */
export interface FsrsCardFields {
  fsrsState: FsrsCardState;
  fsrsStability: number | null;
  fsrsDifficulty: number | null;
  fsrsScheduledDays: number;
  fsrsLearningSteps: number;
  reviewCount: number;
  lapseCount: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
}

/** Fields to update on UserVocabulary after an FSRS scheduling. */
export interface UserVocabularyFsrsUpdate {
  fsrsState: FsrsCardState;
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsScheduledDays: number;
  fsrsLearningSteps: number;
  reviewCount: number;
  lapseCount: number;
  nextReviewAt: Date;
  lastReviewedAt: Date;
}

/** Result of scheduling a card with a given rating. */
export interface SchedulingResult {
  card: Card;
  log: RecordLogItem;
  rating: Grade;
}

/** Session budget targets computed from user preference. */
export interface SessionTargets {
  targetActivityCount: number;
  newWordTarget: number;
}

// ---------------------------------------------------------------------------
// State mapping helpers
// ---------------------------------------------------------------------------

const FSRS_STATE_TO_TS: Record<FsrsCardState, State> = {
  NEW: State.New,
  LEARNING: State.Learning,
  REVIEW: State.Review,
  RELEARNING: State.Relearning,
};

const TS_STATE_TO_FSRS: Record<State, FsrsCardState> = {
  [State.New]: 'NEW',
  [State.Learning]: 'LEARNING',
  [State.Review]: 'REVIEW',
  [State.Relearning]: 'RELEARNING',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class TutorFsrsService {
  /** Initialized once with project-wide FSRS parameters. */
  private readonly scheduler = fsrs(
    generatorParameters({ request_retention: REQUEST_RETENTION }),
  );

  /**
   * Returns the study date string (YYYY-MM-DD) for a given instant
   * in the Asia/Ho_Chi_Minh timezone.
   *
   * Uses Intl.DateTimeFormat so the result is never influenced by the
   * operating-system timezone setting.
   */
  getStudyDate(now: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? '';

    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  /**
   * Reconstructs a ts-fsrs Card from the FSRS fields stored in
   * UserVocabulary. A NEW card that has never been reviewed gets the
   * canonical empty-card baseline.
   */
  buildFsrsCard(fields: FsrsCardFields): Card {
    if (fields.fsrsState === 'NEW' && fields.reviewCount === 0) {
      return createEmptyCard();
    }

    return {
      due: fields.nextReviewAt ?? new Date(),
      stability: fields.fsrsStability ?? 0,
      difficulty: fields.fsrsDifficulty ?? 0,
      elapsed_days: 0,
      scheduled_days: fields.fsrsScheduledDays,
      reps: fields.reviewCount,
      lapses: fields.lapseCount,
      learning_steps: fields.fsrsLearningSteps,
      state: FSRS_STATE_TO_TS[fields.fsrsState],
      last_review: fields.lastReviewedAt ?? undefined,
    };
  }

  /**
   * Runs the FSRS scheduler for the given card and rating.
   * The `now` parameter is the moment the answer was submitted.
   */
  scheduleFsrsCard(
    card: Card,
    rating: Grade,
    now: Date = new Date(),
  ): SchedulingResult {
    const recordLog: RecordLog = this.scheduler.repeat(card, now);
    const item: RecordLogItem = recordLog[rating];
    return {
      card: item.card,
      log: item,
      rating,
    };
  }

  /**
   * Maps the ts-fsrs scheduling result to a Prisma-compatible update
   * object for UserVocabulary. The `reviewedAt` should be the moment
   * the answer was submitted (same `now` passed to `scheduleFsrsCard`).
   */
  mapCardToUpdate(
    result: SchedulingResult,
    reviewedAt: Date,
  ): UserVocabularyFsrsUpdate {
    const { card } = result;
    return {
      fsrsState: TS_STATE_TO_FSRS[card.state],
      fsrsStability: card.stability,
      fsrsDifficulty: card.difficulty,
      fsrsScheduledDays: card.scheduled_days,
      fsrsLearningSteps: card.learning_steps,
      reviewCount: card.reps,
      lapseCount: card.lapses,
      nextReviewAt: card.due,
      lastReviewedAt: reviewedAt,
    };
  }

  /**
   * Computes the session budget targets from the user's daily study
   * preference and how many NEW vocabulary items they currently have.
   *
   * targetActivityCount = clamp(floor(minutes * 60 / 45), min=3, max=40)
   * newWordTarget = ceil(targetActivityCount * 20%), minimum 1 when the
   * user still has NEW words; 0 when they have none.
   */
  calcSessionTargets(
    dailyStudyMinutes: number,
    newVocabCount: number,
  ): SessionTargets {
    const raw = Math.floor((dailyStudyMinutes * 60) / SECONDS_PER_ACTIVITY);
    const targetActivityCount = Math.max(
      MIN_ACTIVITY_COUNT,
      Math.min(MAX_ACTIVITY_COUNT, raw),
    );

    const newWordTarget =
      newVocabCount > 0
        ? Math.max(1, Math.ceil(targetActivityCount * NEW_WORD_RATIO))
        : 0;

    return { targetActivityCount, newWordTarget };
  }
}
