/* eslint-disable @typescript-eslint/unbound-method */
import {
  CefrLevel,
  LearningStatus,
  QuestionType,
} from '../../../../../generated/prisma/enums';
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
    getQuizSessionCount: jest.fn(),
    queryQuizAggregate: jest.fn(),
    queryQuestionTypes: jest.fn(),
    queryQuizTrend: jest.fn(),
  } as unknown as LearnerAnalyticsRepository;
  const service = new LearnerAnalyticsService(repository, {
    port: 3000,
    analyticsTimezone: 'UTC',
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(repository.getOverview).mockResolvedValue([0, 0, 0, 0, 0, []]);
    jest
      .mocked(repository.getVocabularySnapshot)
      .mockResolvedValue([[], 0, []]);
    jest.mocked(repository.queryVocabularyTrend).mockResolvedValue([]);
    jest.mocked(repository.getReadingCounts).mockResolvedValue([0, 0]);
    jest.mocked(repository.queryReadingCategories).mockResolvedValue([]);
    jest.mocked(repository.queryReadingTrend).mockResolvedValue([]);
    jest.mocked(repository.getQuizSessionCount).mockResolvedValue(0);
    jest.mocked(repository.queryQuizAggregate).mockResolvedValue([]);
    jest.mocked(repository.queryQuestionTypes).mockResolvedValue([]);
    jest.mocked(repository.queryQuizTrend).mockResolvedValue([]);
  });

  it('returns the unchanged zero-data overview contract', async () => {
    await expect(
      service.getOverview('owner-id', {}, new Date('2026-07-24T00:00:00Z')),
    ).resolves.toEqual({
      savedVocabulary: 0,
      dueToday: 0,
      mastered: 0,
      articlesCompleted: 0,
      quizAccuracy: 0,
      sessions: 0,
    });
  });

  it('keeps stable empty status, CEFR, and date buckets', async () => {
    const result = await service.getVocabularyAnalytics('owner-id', {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-04T00:00:00Z',
    });
    expect(result.byStatus).toEqual(
      Object.values(LearningStatus).map((status) => ({ status, count: 0 })),
    );
    expect(result.byCefr).toEqual(
      Object.values(CefrLevel).map((cefrLevel) => ({ cefrLevel, count: 0 })),
    );
    expect(result.savedTrend).toEqual([
      { bucket: '2026-07-01', count: 0 },
      { bucket: '2026-07-02', count: 0 },
      { bucket: '2026-07-03', count: 0 },
    ]);
  });

  it('keeps answer accuracy distinct from normalized quiz score and fills question types', async () => {
    jest.mocked(repository.getQuizSessionCount).mockResolvedValue(1);
    jest
      .mocked(repository.queryQuizAggregate)
      .mockResolvedValue([
        { answers: 4n, correctAnswers: 3n, averageScore: 0.625 },
      ]);
    const result = await service.getQuizAnalytics('owner-id', {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-02T00:00:00Z',
    });
    expect(result.accuracy).toBe(0.75);
    expect(result.averageScore).toBe(0.625);
    expect(result.byQuestionType).toEqual(
      Object.values(QuestionType).map((questionType) => ({
        questionType,
        answers: 0,
        correctAnswers: 0,
        accuracy: 0,
      })),
    );
  });
});
