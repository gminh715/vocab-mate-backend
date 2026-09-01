/* eslint-disable @typescript-eslint/unbound-method */
import { CefrLevel } from '../../../../../generated/prisma/enums';
import { LearnerAnalyticsRepository } from '../../../../../src/modules/analytics/repositories/learner-analytics.repository';
import { LearnerAnalyticsService } from '../../../../../src/modules/analytics/services/learner-analytics.service';

describe('LearnerAnalyticsService', () => {
  const repository = {
    getOverview: jest.fn(),
    getVocabularySnapshot: jest.fn(),
    queryVocabularyTrend: jest.fn(),
    getReadingCounts: jest.fn(),
    queryReadingCategories: jest.fn(),
    queryReadingTrend: jest.fn(),
    getFsrsStateCounts: jest.fn(),
    getCompletedStudyDates: jest.fn(),
  } as unknown as LearnerAnalyticsRepository;
  const service = new LearnerAnalyticsService(repository, {
    port: 3000,
    analyticsTimezone: 'UTC',
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(repository.getOverview).mockResolvedValue([0, 0]);
    jest.mocked(repository.getVocabularySnapshot).mockResolvedValue([0, []]);
    jest.mocked(repository.queryVocabularyTrend).mockResolvedValue([]);
    jest.mocked(repository.getReadingCounts).mockResolvedValue([0, 0]);
    jest.mocked(repository.queryReadingCategories).mockResolvedValue([]);
    jest.mocked(repository.queryReadingTrend).mockResolvedValue([]);
    jest.mocked(repository.getFsrsStateCounts).mockResolvedValue([0, []]);
    jest.mocked(repository.getCompletedStudyDates).mockResolvedValue([]);
  });

  it('returns the unchanged zero-data overview contract', async () => {
    await expect(
      service.getOverview('owner-id', {}, new Date('2026-07-24T00:00:00Z')),
    ).resolves.toEqual({
      savedVocabulary: 0,
      articlesCompleted: 0,
    });
  });

  it('keeps stable empty CEFR and date buckets', async () => {
    const result = await service.getVocabularyAnalytics('owner-id', {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-04T00:00:00Z',
    });
    expect(result.byCefr).toEqual(
      Object.values(CefrLevel).map((cefrLevel) => ({ cefrLevel, count: 0 })),
    );
    expect(result.savedTrend).toEqual([
      { bucket: '2026-07-01', count: 0 },
      { bucket: '2026-07-02', count: 0 },
      { bucket: '2026-07-03', count: 0 },
    ]);
    expect(result).not.toHaveProperty('byStatus');
  });

  it('returns review analytics with zero data correctly', async () => {
    const result = await service.getReviewAnalytics(
      'owner-id',
      new Date('2026-08-31T10:00:00Z'),
    );

    expect(result.streak.currentStreak).toBe(0);
    expect(result.streak.longestStreak).toBe(0);
    expect(result.streak.isTodayCompleted).toBe(false);
    expect(result.streak.completedDates).toEqual([]);
    expect(result.streak.recentDays).toHaveLength(7);
    expect(result.streak.recentDays[6]).toEqual({
      date: '2026-08-31',
      isCompleted: false,
      isToday: true,
    });
    expect(result.mastery).toEqual({
      total: 0,
      newCount: 0,
      learningCount: 0,
      reviewCount: 0,
      relearningCount: 0,
      masteryRate: 0,
    });
  });

  it('calculates current streak, longest streak, and FSRS mastery distribution', async () => {
    jest.mocked(repository.getFsrsStateCounts).mockResolvedValue([
      10,
      [
        { fsrsState: 'NEW', _count: { _all: 2 } },
        { fsrsState: 'LEARNING', _count: { _all: 3 } },
        { fsrsState: 'REVIEW', _count: { _all: 4 } },
        { fsrsState: 'RELEARNING', _count: { _all: 1 } },
      ] as any,
    ]);

    jest.mocked(repository.getCompletedStudyDates).mockResolvedValue([
      { studyDate: new Date('2026-08-31T00:00:00Z') },
      { studyDate: new Date('2026-08-30T00:00:00Z') },
      { studyDate: new Date('2026-08-29T00:00:00Z') },
      { studyDate: new Date('2026-08-20T00:00:00Z') },
      { studyDate: new Date('2026-08-19T00:00:00Z') },
      { studyDate: new Date('2026-08-18T00:00:00Z') },
      { studyDate: new Date('2026-08-17T00:00:00Z') },
    ]);

    const result = await service.getReviewAnalytics(
      'owner-id',
      new Date('2026-08-31T10:00:00Z'),
    );

    expect(result.streak.currentStreak).toBe(3);
    expect(result.streak.longestStreak).toBe(4);
    expect(result.streak.isTodayCompleted).toBe(true);
    expect(result.streak.completedDates).toEqual([
      '2026-08-31',
      '2026-08-30',
      '2026-08-29',
      '2026-08-20',
      '2026-08-19',
      '2026-08-18',
      '2026-08-17',
    ]);
    expect(result.streak.recentDays[6]).toEqual({
      date: '2026-08-31',
      isCompleted: true,
      isToday: true,
    });
    expect(result.streak.recentDays[5]).toEqual({
      date: '2026-08-30',
      isCompleted: true,
      isToday: false,
    });
    expect(result.streak.recentDays[4]).toEqual({
      date: '2026-08-29',
      isCompleted: true,
      isToday: false,
    });
    expect(result.streak.recentDays[3]).toEqual({
      date: '2026-08-28',
      isCompleted: false,
      isToday: false,
    });

    expect(result.mastery).toEqual({
      total: 10,
      newCount: 2,
      learningCount: 3,
      reviewCount: 4,
      relearningCount: 1,
      masteryRate: 0.4,
    });
  });
});


