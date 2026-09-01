import { Test, type TestingModule } from '@nestjs/testing';
import { Rating } from 'ts-fsrs';
import {
  TutorRatingService,
  type RatingParams,
} from '../../../../src/modules/tutor/services/tutor-rating.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const base = (): RatingParams => ({
  isCorrect: true,
  hintUsed: false,
  responseTimeMs: 10_000, // 10 s — not slow, not fast enough for Easy
  questionType: 'CONTEXTUAL_CLOZE',
  fsrsState: 'REVIEW',
  reviewCount: 5,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TutorRatingService', () => {
  let service: TutorRatingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TutorRatingService],
    }).compile();

    service = module.get(TutorRatingService);
  });

  // ─── Wrong answers ─────────────────────────────────────────────────────────

  describe('wrong answers', () => {
    it('returns Again for any wrong answer regardless of question type', () => {
      for (const questionType of [
        'MULTIPLE_CHOICE',
        'CONTEXTUAL_CLOZE',
        'TYPED_RECALL',
        'MICRO_LESSON_RETEST',
      ] as const) {
        expect(
          service.mapToFsrsRating({
            ...base(),
            isCorrect: false,
            questionType,
          }),
        ).toBe(Rating.Again);
      }
    });
  });

  // ─── Hint / slow → Hard ────────────────────────────────────────────────────

  describe('hint or slow response', () => {
    it('returns Hard when hint was used (CONTEXTUAL_CLOZE)', () => {
      expect(service.mapToFsrsRating({ ...base(), hintUsed: true })).toBe(
        Rating.Hard,
      );
    });

    it('returns Hard when hint was used (TYPED_RECALL, even meets Easy criteria otherwise)', () => {
      expect(
        service.mapToFsrsRating({
          ...base(),
          questionType: 'TYPED_RECALL',
          hintUsed: true,
          responseTimeMs: 3_000,
          reviewCount: 5,
          fsrsState: 'REVIEW',
        }),
      ).toBe(Rating.Hard);
    });

    it('returns Hard when responseTimeMs >= 30 000 ms', () => {
      expect(
        service.mapToFsrsRating({ ...base(), responseTimeMs: 30_000 }),
      ).toBe(Rating.Hard);
    });

    it('returns Hard when responseTimeMs > 30 000 ms', () => {
      expect(
        service.mapToFsrsRating({ ...base(), responseTimeMs: 45_000 }),
      ).toBe(Rating.Hard);
    });

    it('does NOT return Hard for responseTimeMs = 29 999 ms (just under threshold)', () => {
      expect(
        service.mapToFsrsRating({ ...base(), responseTimeMs: 29_999 }),
      ).not.toBe(Rating.Hard);
    });
  });

  // ─── MULTIPLE_CHOICE ───────────────────────────────────────────────────────

  describe('MULTIPLE_CHOICE', () => {
    it('returns Hard for a correct MC answer with no hint and fast response', () => {
      expect(
        service.mapToFsrsRating({
          ...base(),
          questionType: 'MULTIPLE_CHOICE',
          hintUsed: false,
          responseTimeMs: 3_000,
        }),
      ).toBe(Rating.Hard);
    });

    it('still returns Hard for MC even with very fast response and many reviews', () => {
      // MC ceiling is Hard — cannot be Good or Easy
      expect(
        service.mapToFsrsRating({
          ...base(),
          questionType: 'MULTIPLE_CHOICE',
          responseTimeMs: 1_000,
          reviewCount: 10,
        }),
      ).toBe(Rating.Hard);
    });
  });

  // ─── CONTEXTUAL_CLOZE ──────────────────────────────────────────────────────

  describe('CONTEXTUAL_CLOZE', () => {
    it('returns Good for correct cloze with no hint and fast response', () => {
      expect(
        service.mapToFsrsRating({
          ...base(),
          questionType: 'CONTEXTUAL_CLOZE',
          hintUsed: false,
          responseTimeMs: 8_000,
        }),
      ).toBe(Rating.Good);
    });
  });

  // ─── MICRO_LESSON_RETEST ───────────────────────────────────────────────────

  describe('MICRO_LESSON_RETEST', () => {
    it('returns Good for correct retest with no hint and fast response', () => {
      expect(
        service.mapToFsrsRating({
          ...base(),
          questionType: 'MICRO_LESSON_RETEST',
          hintUsed: false,
          responseTimeMs: 6_000,
          reviewCount: 10,
        }),
      ).toBe(Rating.Good);
    });

    it('returns Hard if hint used on retest (hint rule takes priority over type ceiling)', () => {
      expect(
        service.mapToFsrsRating({
          ...base(),
          questionType: 'MICRO_LESSON_RETEST',
          hintUsed: true,
          responseTimeMs: 6_000,
        }),
      ).toBe(Rating.Hard);
    });
  });

  // ─── TYPED_RECALL — Easy conditions ────────────────────────────────────────

  describe('TYPED_RECALL — Easy', () => {
    const easyBase = (): RatingParams => ({
      isCorrect: true,
      hintUsed: false,
      responseTimeMs: 3_000, // < 5 000
      questionType: 'TYPED_RECALL',
      fsrsState: 'REVIEW',
      reviewCount: 3, // >= 3
    });

    it('returns Easy when all conditions are met', () => {
      expect(service.mapToFsrsRating(easyBase())).toBe(Rating.Easy);
    });

    it('returns Good when reviewCount < 3', () => {
      expect(service.mapToFsrsRating({ ...easyBase(), reviewCount: 2 })).toBe(
        Rating.Good,
      );
    });

    it('returns Good when fsrsState is not REVIEW (LEARNING)', () => {
      expect(
        service.mapToFsrsRating({ ...easyBase(), fsrsState: 'LEARNING' }),
      ).toBe(Rating.Good);
    });

    it('returns Good when fsrsState is not REVIEW (NEW)', () => {
      expect(service.mapToFsrsRating({ ...easyBase(), fsrsState: 'NEW' })).toBe(
        Rating.Good,
      );
    });

    it('returns Good when fsrsState is RELEARNING', () => {
      expect(
        service.mapToFsrsRating({ ...easyBase(), fsrsState: 'RELEARNING' }),
      ).toBe(Rating.Good);
    });

    it('returns Good when responseTimeMs equals 5 000 ms (not strictly < 5 000)', () => {
      expect(
        service.mapToFsrsRating({ ...easyBase(), responseTimeMs: 5_000 }),
      ).toBe(Rating.Good);
    });

    it('returns Good when responseTimeMs is null (unknown timing)', () => {
      expect(
        service.mapToFsrsRating({ ...easyBase(), responseTimeMs: null }),
      ).toBe(Rating.Good);
    });

    it('returns Easy with reviewCount exactly 3 (boundary)', () => {
      expect(service.mapToFsrsRating({ ...easyBase(), reviewCount: 3 })).toBe(
        Rating.Easy,
      );
    });

    it('returns Easy with responseTimeMs = 4 999 ms (just under threshold)', () => {
      expect(
        service.mapToFsrsRating({ ...easyBase(), responseTimeMs: 4_999 }),
      ).toBe(Rating.Easy);
    });
  });

  // ─── TYPED_RECALL — Good fallbacks ─────────────────────────────────────────

  describe('TYPED_RECALL — Good fallbacks', () => {
    it('returns Good for correct typed recall that almost qualifies for Easy', () => {
      expect(
        service.mapToFsrsRating({
          isCorrect: true,
          hintUsed: false,
          responseTimeMs: 10_000, // not slow but > 5 s
          questionType: 'TYPED_RECALL',
          fsrsState: 'REVIEW',
          reviewCount: 5,
        }),
      ).toBe(Rating.Good);
    });
  });

  // ─── normalizeTypedAnswer ──────────────────────────────────────────────────

  describe('normalizeTypedAnswer()', () => {
    it('trims leading and trailing whitespace', () => {
      expect(service.normalizeTypedAnswer('  hello  ')).toBe('hello');
    });

    it('lowercases the answer using en-US locale', () => {
      expect(service.normalizeTypedAnswer('AMBITIOUS')).toBe('ambitious');
    });

    it('does not remove internal whitespace', () => {
      expect(service.normalizeTypedAnswer('turn off')).toBe('turn off');
    });

    it('does not remove punctuation', () => {
      expect(service.normalizeTypedAnswer("it's a test")).toBe("it's a test");
    });

    it('handles empty string', () => {
      expect(service.normalizeTypedAnswer('')).toBe('');
    });

    it('handles mixed case with trim', () => {
      expect(service.normalizeTypedAnswer('  Give Up  ')).toBe('give up');
    });
  });
});
