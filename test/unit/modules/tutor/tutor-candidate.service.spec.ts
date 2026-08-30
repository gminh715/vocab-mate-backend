import { Test, type TestingModule } from '@nestjs/testing';
import { TutorCandidateService } from '../../../../src/modules/tutor/services/tutor-candidate.service';
import { PrismaService } from '../../../../src/database/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-06-15T10:00:00Z');

/** Builds a minimal mock row as Prisma would return it. */
const makeRow = (
  overrides: {
    id?: string;
    fsrsState?: string;
    nextReviewAt?: Date | null;
    savedAt?: Date;
    articleSentenceTerm?: { sentenceId: string };
  } = {},
) => ({
  id: overrides.id ?? 'vocab-1',
  userId: 'user-1',
  fsrsState: overrides.fsrsState ?? 'NEW',
  fsrsStability: null,
  fsrsDifficulty: null,
  fsrsScheduledDays: 0,
  fsrsLearningSteps: 0,
  reviewCount: 0,
  lapseCount: 0,
  nextReviewAt: overrides.nextReviewAt ?? null,
  lastReviewedAt: null,
  savedWordDisplay: 'test',
  savedLemma: 'test',
  savedPartOfSpeech: 'noun',
  savedCefrLevel: 'B1',
  savedMeaningVi: 'kiểm tra',
  savedExamples: [],
  articleSentenceTermId: 'term-1',
  articleSentenceTerm: overrides.articleSentenceTerm ?? {
    sentenceId: 'sent-1',
  },
  savedAt: overrides.savedAt ?? new Date('2025-01-01T00:00:00Z'),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TutorCandidateService', () => {
  let service: TutorCandidateService;
  let prisma: {
    userVocabulary: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      userVocabulary: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TutorCandidateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TutorCandidateService);
  });

  // ─── getCandidatePool ──────────────────────────────────────────────────────

  describe('getCandidatePool()', () => {
    it('queries all 4 buckets in parallel', async () => {
      prisma.userVocabulary.findMany
        .mockResolvedValueOnce([
          makeRow({
            fsrsState: 'RELEARNING',
            nextReviewAt: new Date('2025-06-14T00:00:00Z'),
          }),
        ])
        .mockResolvedValueOnce([
          makeRow({
            fsrsState: 'LEARNING',
            nextReviewAt: new Date('2025-06-14T00:00:00Z'),
          }),
        ])
        .mockResolvedValueOnce([
          makeRow({
            fsrsState: 'REVIEW',
            nextReviewAt: new Date('2025-06-14T00:00:00Z'),
          }),
        ])
        .mockResolvedValueOnce([makeRow({ fsrsState: 'NEW' })]);

      await service.getCandidatePool('user-1', NOW);

      expect(prisma.userVocabulary.findMany).toHaveBeenCalledTimes(4);
    });

    it('places RELEARNING before LEARNING before REVIEW before NEW in result order', async () => {
      const relearning = makeRow({
        id: 'r1',
        fsrsState: 'RELEARNING',
        nextReviewAt: NOW,
      });
      const learning = makeRow({
        id: 'l1',
        fsrsState: 'LEARNING',
        nextReviewAt: NOW,
      });
      const review = makeRow({
        id: 'v1',
        fsrsState: 'REVIEW',
        nextReviewAt: NOW,
      });
      const newWord = makeRow({ id: 'n1', fsrsState: 'NEW' });

      prisma.userVocabulary.findMany
        .mockResolvedValueOnce([relearning])
        .mockResolvedValueOnce([learning])
        .mockResolvedValueOnce([review])
        .mockResolvedValueOnce([newWord]);

      const result = await service.getCandidatePool('user-1', NOW);

      expect(result.map((c) => c.id)).toEqual(['r1', 'l1', 'v1', 'n1']);
    });

    it('flattens the articleSentenceTerm join into sentenceId', async () => {
      const row = makeRow({
        articleSentenceTerm: { sentenceId: 'sentence-xyz' },
      });
      prisma.userVocabulary.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getCandidatePool('user-1', NOW);

      expect(result[0].sentenceId).toBe('sentence-xyz');
      expect(result[0].articleSentenceTermId).toBe('term-1');
    });

    it('scopes queries to the authenticated userId', async () => {
      prisma.userVocabulary.findMany.mockResolvedValue([]);

      await service.getCandidatePool('user-abc', NOW);

      const calls = prisma.userVocabulary.findMany.mock.calls as Array<
        Array<{ where: { userId: string } }>
      >;
      for (const [args] of calls) {
        expect(args.where.userId).toBe('user-abc');
      }
    });

    it('always passes a take limit to each query', async () => {
      prisma.userVocabulary.findMany.mockResolvedValue([]);

      await service.getCandidatePool('user-1', NOW, 20);

      const calls = prisma.userVocabulary.findMany.mock.calls as Array<
        Array<{ take: number }>
      >;
      for (const [args] of calls) {
        expect(args.take).toBeGreaterThan(0);
        expect(args.take).toBeLessThanOrEqual(50);
      }
    });

    it('caps pool size to the provided limit even when buckets are large', async () => {
      // Each bucket returns 5 items → 20 total; limit=10 → slice to 10
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeRow({ id: `id-${i}`, fsrsState: 'NEW' }),
      );
      prisma.userVocabulary.findMany.mockResolvedValue(rows);

      const result = await service.getCandidatePool('user-1', NOW, 10);

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('caps the effective limit at the internal maximum (50)', async () => {
      prisma.userVocabulary.findMany.mockResolvedValue([]);

      await service.getCandidatePool('user-1', NOW, 999);

      const calls = prisma.userVocabulary.findMany.mock.calls as Array<
        Array<{ take: number }>
      >;
      for (const [args] of calls) {
        expect(args.take).toBeLessThanOrEqual(50);
      }
    });

    it('falls back to all user vocabulary when all 4 due/new buckets are empty', async () => {
      const fallbackRow = makeRow({
        id: 'f1',
        fsrsState: 'LEARNING',
        nextReviewAt: new Date('2025-06-15T10:10:00Z'), // not due yet
      });

      // 4 empty buckets, followed by 5th call returning fallback vocabulary
      prisma.userVocabulary.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([fallbackRow]);

      const result = await service.getCandidatePool('user-1', NOW);

      expect(result.map((c) => c.id)).toEqual(['f1']);
    });

    it('returns an empty pool when all buckets and fallback are empty', async () => {
      prisma.userVocabulary.findMany.mockResolvedValue([]);

      const result = await service.getCandidatePool('user-1', NOW);

      expect(result).toEqual([]);
    });
  });

  // ─── countNewVocab ─────────────────────────────────────────────────────────

  describe('countNewVocab()', () => {
    it('counts NEW vocabulary items for the given user', async () => {
      prisma.userVocabulary.count.mockResolvedValue(7);

      const result = await service.countNewVocab('user-1');

      expect(result).toBe(7);
      expect(prisma.userVocabulary.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', fsrsState: 'NEW' },
      });
    });

    it('returns 0 when no NEW vocabulary exists', async () => {
      prisma.userVocabulary.count.mockResolvedValue(0);

      const result = await service.countNewVocab('user-1');

      expect(result).toBe(0);
    });
  });
});
