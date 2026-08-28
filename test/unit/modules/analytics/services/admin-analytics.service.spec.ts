/* eslint-disable @typescript-eslint/unbound-method */
import { AdminAnalyticsRepository } from '../../../../../src/modules/analytics/repositories/admin-analytics.repository';
import { AdminAnalyticsService } from '../../../../../src/modules/analytics/services/admin-analytics.service';

describe('AdminAnalyticsService', () => {
  const repository = {
    getOverview: jest.fn(),
    queryTopArticles: jest.fn(),
    queryCompletionRates: jest.fn(),
    queryTermSaveCounts: jest.fn(),
    queryRegistrationTrend: jest.fn(),
    queryActiveUserCount: jest.fn(),
    queryRetention: jest.fn(),
    queryLearningDistribution: jest.fn(),
  } as unknown as AdminAnalyticsRepository;
  const service = new AdminAnalyticsService(repository, {
    port: 3000,
    analyticsTimezone: 'UTC',
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(repository.getOverview).mockResolvedValue([0, [], 0, 0, 0, 0]);
    jest.mocked(repository.queryTopArticles).mockResolvedValue([]);
    jest.mocked(repository.queryCompletionRates).mockResolvedValue([]);
    jest.mocked(repository.queryTermSaveCounts).mockResolvedValue([]);
    jest.mocked(repository.queryRegistrationTrend).mockResolvedValue([]);
    jest.mocked(repository.queryActiveUserCount).mockResolvedValue([]);
    jest.mocked(repository.queryRetention).mockResolvedValue([]);
    jest.mocked(repository.queryLearningDistribution).mockResolvedValue([]);
  });

  it('preserves empty-data admin overview and content contracts', async () => {
    await expect(service.getAdminOverview({})).resolves.toEqual({
      users: 0,
      activeUsers: 0,
      articles: 0,
      publishedArticles: 0,
      savedVocabulary: 0,
    });
    await expect(service.getAdminContentAnalytics({})).resolves.toEqual({
      topArticles: [],
      completionRates: [],
      termSaveCounts: [],
    });
  });

  it('keeps user-status aggregation results bounded and zero-filled', async () => {
    await expect(
      service.getAdminUserAnalytics({
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-02T00:00:00Z',
        status: 'ACTIVE',
      }),
    ).resolves.toEqual({
      registrationsTrend: [{ bucket: '2026-07-01', registrations: 0 }],
      activeLearners: 0,
      retentionProxy: {
        firstWindowActive: 0,
        secondWindowActive: 0,
        retainedUsers: 0,
        rate: 0,
      },
      learningDistribution: {
        inactive: 0,
        readingOnly: 0,
        vocabularyOnly: 0,
        multiActivity: 0,
      },
    });
  });
});
