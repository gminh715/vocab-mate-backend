/* eslint-disable @typescript-eslint/unbound-method */
import { ReviewAnalyticsRepository } from '../../../../../src/modules/analytics/repositories/review-analytics.repository';
import { ReviewAnalyticsService } from '../../../../../src/modules/analytics/services/review-analytics.service';

describe('ReviewAnalyticsService', () => {
  const repository = {
    querySessionEvaluation: jest.fn(),
    querySkillEvaluation: jest.fn(),
    queryDecisionEvaluation: jest.fn(),
    queryRetentionEvaluation: jest.fn(),
    queryTrend: jest.fn(),
  } as unknown as ReviewAnalyticsRepository;
  const service = new ReviewAnalyticsService(repository, {
    port: 3000,
    analyticsTimezone: 'UTC',
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(repository.querySessionEvaluation).mockResolvedValue([]);
    jest.mocked(repository.querySkillEvaluation).mockResolvedValue([]);
    jest.mocked(repository.queryDecisionEvaluation).mockResolvedValue([]);
    jest.mocked(repository.queryRetentionEvaluation).mockResolvedValue([]);
    jest.mocked(repository.queryTrend).mockResolvedValue([]);
  });

  it('returns deterministic zero-data review analytics and date buckets', async () => {
    await expect(
      service.getReviewAnalytics('owner-id', {
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-02T00:00:00Z',
      }),
    ).resolves.toMatchObject({
      sessionsStarted: 0,
      sessionsCompleted: 0,
      sessionsAbandoned: 0,
      completionRate: 0,
      answers: 0,
      correctAnswers: 0,
      accuracy: 0,
      averageResponseTimeMs: null,
      hintsUsed: 0,
      byDuration: [
        {
          targetDurationMinutes: 5,
          started: 0,
          completed: 0,
          completionRate: 0,
        },
        {
          targetDurationMinutes: 10,
          started: 0,
          completed: 0,
          completionRate: 0,
        },
        {
          targetDurationMinutes: 15,
          started: 0,
          completed: 0,
          completionRate: 0,
        },
      ],
      trend: [
        {
          bucket: '2026-07-01',
          answers: 0,
          correctAnswers: 0,
          accuracy: 0,
          averageResponseTimeMs: null,
          hintsUsed: 0,
        },
      ],
    });
  });
});
