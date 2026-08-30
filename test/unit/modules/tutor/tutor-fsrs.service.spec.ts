import { Test, type TestingModule } from '@nestjs/testing';
import {
  TutorFsrsService,
  type FsrsCardFields,
} from '../../../../src/modules/tutor/services/tutor-fsrs.service';
import { Rating, State } from 'ts-fsrs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a Date at a given UTC time string. */
const utc = (iso: string) => new Date(iso);

/** Default NEW card fields with no review history. */
const newCardFields = (): FsrsCardFields => ({
  fsrsState: 'NEW',
  fsrsStability: null,
  fsrsDifficulty: null,
  fsrsScheduledDays: 0,
  fsrsLearningSteps: 0,
  reviewCount: 0,
  lapseCount: 0,
  nextReviewAt: null,
  lastReviewedAt: null,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TutorFsrsService', () => {
  let service: TutorFsrsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TutorFsrsService],
    }).compile();

    service = module.get(TutorFsrsService);
  });

  // ─── getStudyDate ──────────────────────────────────────────────────────────

  describe('getStudyDate()', () => {
    it('returns YYYY-MM-DD format', () => {
      const result = service.getStudyDate(utc('2025-06-15T10:00:00Z'));
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns the correct VN date for a UTC morning time', () => {
      // 2025-06-15 10:00 UTC = 2025-06-15 17:00 UTC+7 → same day
      expect(service.getStudyDate(utc('2025-06-15T10:00:00Z'))).toBe(
        '2025-06-15',
      );
    });

    it('returns next day in VN when UTC time crosses midnight in UTC+7', () => {
      // 2025-06-15 17:00:01 UTC = 2025-06-16 00:00:01 UTC+7 → next day VN
      expect(service.getStudyDate(utc('2025-06-15T17:00:01Z'))).toBe(
        '2025-06-16',
      );
    });

    it('returns the previous day in VN when UTC is just before VN midnight', () => {
      // 2025-06-15 16:59:59 UTC = 2025-06-15 23:59:59 UTC+7 → still same day VN
      expect(service.getStudyDate(utc('2025-06-15T16:59:59Z'))).toBe(
        '2025-06-15',
      );
    });

    it('handles the exact midnight boundary in VN timezone', () => {
      // 2025-06-15 17:00:00 UTC = 2025-06-16 00:00:00 UTC+7 → new day
      expect(service.getStudyDate(utc('2025-06-15T17:00:00Z'))).toBe(
        '2025-06-16',
      );
    });

    it('uses current time when no argument is given (smoke test)', () => {
      const result = service.getStudyDate();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ─── calcSessionTargets ────────────────────────────────────────────────────

  describe('calcSessionTargets()', () => {
    it('returns correct count for 5 minutes with new vocab', () => {
      // floor(5*60/45) = floor(300/45) = floor(6.67) = 6 → clamp to max(3, min(40, 6)) = 6
      // newWordTarget = ceil(6 * 0.2) = ceil(1.2) = 2
      const result = service.calcSessionTargets(5, 10);
      expect(result.targetActivityCount).toBe(6);
      expect(result.newWordTarget).toBe(2);
    });

    it('returns correct count for 10 minutes with new vocab', () => {
      // floor(10*60/45) = floor(600/45) = floor(13.33) = 13
      // newWordTarget = ceil(13 * 0.2) = ceil(2.6) = 3
      const result = service.calcSessionTargets(10, 10);
      expect(result.targetActivityCount).toBe(13);
      expect(result.newWordTarget).toBe(3);
    });

    it('returns correct count for 15 minutes with new vocab', () => {
      // floor(15*60/45) = floor(900/45) = floor(20) = 20
      // newWordTarget = ceil(20 * 0.2) = 4
      const result = service.calcSessionTargets(15, 10);
      expect(result.targetActivityCount).toBe(20);
      expect(result.newWordTarget).toBe(4);
    });

    it('returns correct count for 20 minutes with new vocab', () => {
      // floor(20*60/45) = floor(1200/45) = floor(26.67) = 26
      // newWordTarget = ceil(26 * 0.2) = ceil(5.2) = 6
      const result = service.calcSessionTargets(20, 10);
      expect(result.targetActivityCount).toBe(26);
      expect(result.newWordTarget).toBe(6);
    });

    it('clamps to min=3 for very short study time', () => {
      // floor(1*60/45) = 1 → clamped to 3
      const result = service.calcSessionTargets(1, 10);
      expect(result.targetActivityCount).toBe(3);
      expect(result.newWordTarget).toBeGreaterThanOrEqual(1);
    });

    it('clamps to max=40 for very long study time', () => {
      // floor(120*60/45) = 160 → clamped to 40
      const result = service.calcSessionTargets(120, 10);
      expect(result.targetActivityCount).toBe(40);
    });

    it('sets newWordTarget=0 when user has no NEW vocab', () => {
      const result = service.calcSessionTargets(10, 0);
      expect(result.newWordTarget).toBe(0);
    });

    it('sets newWordTarget=1 (minimum) when quota rounds below 1', () => {
      // count=3, ceil(3*0.2)=ceil(0.6)=1 → minimum 1
      const result = service.calcSessionTargets(1, 5); // targetActivityCount=3
      expect(result.newWordTarget).toBe(1);
    });
  });

  // ─── buildFsrsCard ─────────────────────────────────────────────────────────

  describe('buildFsrsCard()', () => {
    it('returns an empty card for a brand-new, never-reviewed vocabulary', () => {
      const card = service.buildFsrsCard(newCardFields());
      expect(card.state).toBe(State.New);
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
    });

    it('reconstructs a REVIEW card from stored fields', () => {
      const nextReview = new Date('2025-06-20T00:00:00Z');
      const lastReview = new Date('2025-06-15T00:00:00Z');
      const fields: FsrsCardFields = {
        fsrsState: 'REVIEW',
        fsrsStability: 10.5,
        fsrsDifficulty: 5.2,
        fsrsScheduledDays: 5,
        fsrsLearningSteps: 0,
        reviewCount: 8,
        lapseCount: 1,
        nextReviewAt: nextReview,
        lastReviewedAt: lastReview,
      };
      const card = service.buildFsrsCard(fields);
      expect(card.state).toBe(State.Review);
      expect(card.stability).toBe(10.5);
      expect(card.difficulty).toBe(5.2);
      expect(card.reps).toBe(8);
      expect(card.lapses).toBe(1);
      expect(card.due).toEqual(nextReview);
    });

    it('maps RELEARNING state correctly', () => {
      const card = service.buildFsrsCard({
        ...newCardFields(),
        fsrsState: 'RELEARNING',
        reviewCount: 3,
      });
      expect(card.state).toBe(State.Relearning);
    });

    it('maps LEARNING state correctly', () => {
      const card = service.buildFsrsCard({
        ...newCardFields(),
        fsrsState: 'LEARNING',
        reviewCount: 1,
      });
      expect(card.state).toBe(State.Learning);
    });
  });

  // ─── scheduleFsrsCard & mapCardToUpdate ───────────────────────────────────

  describe('scheduleFsrsCard() + mapCardToUpdate()', () => {
    it('schedules a new card with Again and maps result back to Prisma fields', () => {
      const card = service.buildFsrsCard(newCardFields());
      const now = new Date('2025-06-15T10:00:00Z');
      const result = service.scheduleFsrsCard(card, Rating.Again, now);

      expect(result.rating).toBe(Rating.Again);
      expect(result.card).toBeDefined();

      const update = service.mapCardToUpdate(result, now);
      expect(update.fsrsState).toBe('LEARNING');
      expect(typeof update.fsrsStability).toBe('number');
      expect(typeof update.fsrsDifficulty).toBe('number');
      expect(update.lastReviewedAt).toEqual(now);
      expect(update.nextReviewAt).toBeInstanceOf(Date);
    });

    it('schedules a REVIEW card with Good and retains REVIEW state', () => {
      const reviewFields: FsrsCardFields = {
        fsrsState: 'REVIEW',
        fsrsStability: 15,
        fsrsDifficulty: 4.5,
        fsrsScheduledDays: 15,
        fsrsLearningSteps: 0,
        reviewCount: 5,
        lapseCount: 0,
        nextReviewAt: new Date('2025-06-15T00:00:00Z'),
        lastReviewedAt: new Date('2025-05-31T00:00:00Z'),
      };
      const card = service.buildFsrsCard(reviewFields);
      const now = new Date('2025-06-15T10:00:00Z');
      const result = service.scheduleFsrsCard(card, Rating.Good, now);
      const update = service.mapCardToUpdate(result, now);

      expect(update.fsrsState).toBe('REVIEW');
      expect(update.reviewCount).toBe(6);
      expect(update.nextReviewAt.getTime()).toBeGreaterThan(now.getTime());
    });

    it('increases lapseCount on Again for a REVIEW card', () => {
      const reviewFields: FsrsCardFields = {
        fsrsState: 'REVIEW',
        fsrsStability: 15,
        fsrsDifficulty: 4.5,
        fsrsScheduledDays: 15,
        fsrsLearningSteps: 0,
        reviewCount: 5,
        lapseCount: 0,
        nextReviewAt: new Date('2025-06-15T00:00:00Z'),
        lastReviewedAt: new Date('2025-05-31T00:00:00Z'),
      };
      const card = service.buildFsrsCard(reviewFields);
      const now = new Date('2025-06-15T10:00:00Z');
      const result = service.scheduleFsrsCard(card, Rating.Again, now);
      const update = service.mapCardToUpdate(result, now);

      expect(update.lapseCount).toBe(1);
      expect(update.fsrsState).toBe('RELEARNING');
    });
  });
});
