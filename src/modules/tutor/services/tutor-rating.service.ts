import { Injectable } from '@nestjs/common';
import { Rating } from 'ts-fsrs';
import {
  type FsrsCardState,
  type TutorQuestionType,
} from '../../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Internal constants — single authoritative source for rating thresholds.
// Controller, AI service, and frontend must never duplicate these rules.
// ---------------------------------------------------------------------------

const SLOW_RESPONSE_MS = 30_000;
const EASY_MAX_RESPONSE_MS = 5_000;
const EASY_MIN_REVIEW_COUNT = 3;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** All inputs needed to determine the FSRS rating for one answered item. */
export interface RatingParams {
  isCorrect: boolean;
  hintUsed: boolean;
  responseTimeMs: number | null;
  questionType: TutorQuestionType;
  fsrsState: FsrsCardState;
  reviewCount: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Owns the authoritative FSRS rating policy for closed questions.
 * This service has no dependencies — it is a pure mapping function.
 */
@Injectable()
export class TutorRatingService {
  /**
   * Maps deterministic answer metadata to an FSRS rating.
   *
   * Policy (in evaluation order):
   *
   * 1. Wrong answer                                               → Again
   * 2. Correct + hint used                                        → Hard
   * 3. Correct + slow (responseTimeMs >= 30 s)                    → Hard
   * 4. MULTIPLE_CHOICE correct (no hint, not slow)                → Hard (ceiling)
   * 5. MICRO_LESSON_RETEST correct (no hint, not slow)            → Good (ceiling)
   * 6. TYPED_RECALL correct, no hint, not slow,
   *      state=REVIEW, reviewCount>=3, responseTimeMs < 5 s       → Easy
   * 7. CONTEXTUAL_CLOZE / TYPED_RECALL correct (all others)       → Good
   */
  mapToFsrsRating(params: RatingParams): Rating {
    if (!params.isCorrect) {
      return Rating.Again;
    }

    const isSlow =
      params.responseTimeMs !== null &&
      params.responseTimeMs >= SLOW_RESPONSE_MS;

    if (params.hintUsed || isSlow) {
      return Rating.Hard;
    }

    switch (params.questionType) {
      case 'MULTIPLE_CHOICE':
        return Rating.Hard;

      case 'MICRO_LESSON_RETEST':
        return Rating.Good;

      case 'TYPED_RECALL': {
        const isEasy =
          params.fsrsState === 'REVIEW' &&
          params.reviewCount >= EASY_MIN_REVIEW_COUNT &&
          params.responseTimeMs !== null &&
          params.responseTimeMs < EASY_MAX_RESPONSE_MS;
        return isEasy ? Rating.Easy : Rating.Good;
      }

      case 'CONTEXTUAL_CLOZE':
        return Rating.Good;

      default:
        return Rating.Good;
    }
  }

  /**
   * Normalizes a typed answer for deterministic comparison.
   *
   * Rules: trim leading/trailing whitespace, then lowercase using
   * English locale. No fuzzy matching, no Levenshtein, no
   * auto-correction, no punctuation removal.
   */
  normalizeTypedAnswer(raw: string): string {
    return raw.trim().toLocaleLowerCase('en-US');
  }
}
