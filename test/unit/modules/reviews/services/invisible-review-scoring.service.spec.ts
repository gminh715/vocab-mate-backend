import {
  LearningStatus,
  QuestionType,
} from '../../../../../generated/prisma/enums';
import {
  InvisibleReviewScoringService,
  MAX_REVIEW_INTERVAL_DAYS,
  SLOW_RESPONSE_THRESHOLD_MS,
  type ReviewScoreInput,
  type VocabularyReviewState,
} from '../../../../../src/modules/reviews/services/invisible-review-scoring.service';

describe('InvisibleReviewScoringService', () => {
  const service = new InvisibleReviewScoringService();
  const now = new Date('2026-08-03T00:00:00.000Z');
  const baseScoreInput: ReviewScoreInput = {
    isCorrect: true,
    previousFailedAttempts: 0,
    hintsUsed: 0,
    questionType: QuestionType.SELECT_MEANING,
    responseTimeMs: 1_000,
  };
  const baseVocabulary: VocabularyReviewState = {
    learningStatus: LearningStatus.REVIEWING,
    reviewIntervalDays: 4,
    consecutiveCorrectReviews: 1,
    lapseCount: 2,
  };

  describe('inferScore', () => {
    it.each([
      [{ ...baseScoreInput, isCorrect: false }, 0],
      [{ ...baseScoreInput, isSkipped: true }, 0],
      [{ ...baseScoreInput, previousFailedAttempts: 1 }, 2],
      [{ ...baseScoreInput, hintsUsed: 1 }, 3],
      [{ ...baseScoreInput, questionType: QuestionType.SELECT_WORD }, 4],
      [
        {
          ...baseScoreInput,
          questionType: QuestionType.SELECT_CORRECT_CONTEXT,
        },
        4,
      ],
      [{ ...baseScoreInput, questionType: QuestionType.FILL_BLANK }, 5],
    ])('infers the deterministic score for %#', (input, expected) => {
      expect(service.inferScore(input)).toBe(expected);
    });

    it('gives retry precedence over hints and question type', () => {
      expect(
        service.inferScore({
          ...baseScoreInput,
          previousFailedAttempts: 2,
          hintsUsed: 3,
          questionType: QuestionType.FILL_BLANK,
        }),
      ).toBe(2);
    });

    it('gives hints precedence over the FILL_BLANK question type', () => {
      expect(
        service.inferScore({
          ...baseScoreInput,
          hintsUsed: 1,
          questionType: QuestionType.FILL_BLANK,
        }),
      ).toBe(3);
    });

    it('reduces a slow response by exactly one point only above the threshold', () => {
      const fillBlank = {
        ...baseScoreInput,
        questionType: QuestionType.FILL_BLANK,
      };
      expect(
        service.inferScore({
          ...fillBlank,
          responseTimeMs: SLOW_RESPONSE_THRESHOLD_MS,
        }),
      ).toBe(5);
      expect(
        service.inferScore({
          ...fillBlank,
          responseTimeMs: SLOW_RESPONSE_THRESHOLD_MS + 1,
        }),
      ).toBe(4);
      expect(
        service.inferScore({
          ...baseScoreInput,
          previousFailedAttempts: 1,
          responseTimeMs: SLOW_RESPONSE_THRESHOLD_MS + 1,
        }),
      ).toBe(1);
    });

    it('does not penalize a missing response time', () => {
      expect(
        service.inferScore({ ...baseScoreInput, responseTimeMs: null }),
      ).toBe(4);
    });
  });

  describe('schedule', () => {
    it('resets a failed review and increments a lapse for an established word', () => {
      expect(service.schedule(0, baseVocabulary, now, true)).toEqual({
        learningStatus: LearningStatus.LEARNING,
        reviewIntervalDays: 1,
        lastReviewedAt: now,
        nextReviewAt: new Date('2026-08-04T00:00:00.000Z'),
        consecutiveCorrectReviews: 0,
        lapseCount: 3,
        lastReviewScore: 0,
      });
    });

    it.each([
      LearningStatus.LEARNING,
      LearningStatus.REVIEWING,
      LearningStatus.MASTERED,
    ])(
      'counts forgetting a previously %s word as a lapse',
      (learningStatus) => {
        expect(
          service.schedule(0, { ...baseVocabulary, learningStatus }, now, true)
            .lapseCount,
        ).toBe(3);
      },
    );

    it('does not count a first failure for a NEW word or a repeated failed attempt', () => {
      expect(
        service.schedule(
          0,
          { ...baseVocabulary, learningStatus: LearningStatus.NEW },
          now,
          true,
        ).lapseCount,
      ).toBe(2);
      expect(service.schedule(0, baseVocabulary, now, false).lapseCount).toBe(
        2,
      );
    });

    it('resets score 1 to LEARNING without treating a correct slow retry as a lapse', () => {
      expect(service.schedule(1, baseVocabulary, now, false)).toMatchObject({
        learningStatus: LearningStatus.LEARNING,
        reviewIntervalDays: 1,
        consecutiveCorrectReviews: 0,
        lapseCount: 2,
      });
    });

    it('clamps scores to the supported 0-to-5 boundary', () => {
      expect(service.schedule(-10, baseVocabulary, now, true)).toMatchObject({
        learningStatus: LearningStatus.LEARNING,
        reviewIntervalDays: 1,
        lastReviewScore: 0,
      });
      expect(service.schedule(10, baseVocabulary, now, false)).toMatchObject({
        reviewIntervalDays: 10,
        lastReviewScore: 5,
      });
    });

    it('never increments a lapse for a successful score even if the caller marks it forgotten', () => {
      expect(service.schedule(2, baseVocabulary, now, true).lapseCount).toBe(
        baseVocabulary.lapseCount,
      );
    });

    it.each([
      [2, 10, 1],
      [3, 4, 5],
      [4, 4, 8],
      [5, 4, 10],
      [5, null, 3],
    ])(
      'schedules score %i from interval %s to %i days',
      (score, reviewIntervalDays, expectedInterval) => {
        expect(
          service.schedule(
            score,
            { ...baseVocabulary, reviewIntervalDays },
            now,
            false,
          ).reviewIntervalDays,
        ).toBe(expectedInterval);
      },
    );

    it('clamps intervals to the MVP maximum', () => {
      expect(
        service.schedule(
          5,
          { ...baseVocabulary, reviewIntervalDays: 59 },
          now,
          false,
        ).reviewIntervalDays,
      ).toBe(MAX_REVIEW_INTERVAL_DAYS);
    });

    it('masters only at four successes and an interval of at least 21 days', () => {
      expect(
        service.schedule(
          5,
          {
            ...baseVocabulary,
            reviewIntervalDays: 10,
            consecutiveCorrectReviews: 3,
          },
          now,
          false,
        ),
      ).toMatchObject({
        learningStatus: LearningStatus.MASTERED,
        reviewIntervalDays: 25,
        consecutiveCorrectReviews: 4,
      });
      expect(
        service.schedule(
          4,
          {
            ...baseVocabulary,
            reviewIntervalDays: 10,
            consecutiveCorrectReviews: 3,
          },
          now,
          false,
        ).learningStatus,
      ).toBe(LearningStatus.REVIEWING);
    });

    it('does not master at four successes when the next interval is below 21 days', () => {
      expect(
        service.schedule(
          3,
          {
            ...baseVocabulary,
            reviewIntervalDays: 15,
            consecutiveCorrectReviews: 3,
          },
          now,
          false,
        ),
      ).toMatchObject({
        learningStatus: LearningStatus.REVIEWING,
        reviewIntervalDays: 19,
        consecutiveCorrectReviews: 4,
      });
    });

    it('moves a mastered word back to LEARNING after failure', () => {
      expect(
        service.schedule(
          0,
          {
            learningStatus: LearningStatus.MASTERED,
            reviewIntervalDays: 60,
            consecutiveCorrectReviews: 8,
            lapseCount: 4,
          },
          now,
          true,
        ),
      ).toMatchObject({
        learningStatus: LearningStatus.LEARNING,
        reviewIntervalDays: 1,
        consecutiveCorrectReviews: 0,
        lapseCount: 5,
      });
    });

    it('clamps smallint counters at their database boundary', () => {
      expect(
        service.schedule(
          5,
          {
            ...baseVocabulary,
            consecutiveCorrectReviews: 32_767,
          },
          now,
          false,
        ).consecutiveCorrectReviews,
      ).toBe(32_767);
      expect(
        service.schedule(
          0,
          { ...baseVocabulary, lapseCount: 32_767 },
          now,
          true,
        ).lapseCount,
      ).toBe(32_767);
    });
  });
});
