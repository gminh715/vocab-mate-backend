import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReviewSessionStatus } from '../../../../generated/prisma/enums';
import {
  ActiveReviewSessionConflictError,
  ReviewsRepository,
} from '../reviews.repository';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let repository: Record<string, jest.Mock>;

  beforeEach(async () => {
    repository = {
      startQuizSession: jest.fn(),
      getSessionState: jest.fn(),
      submitAnswer: jest.fn(),
      completeSession: jest.fn(),
      abandonSession: jest.fn(),
      listHistory: jest.fn(),
      getCompletedResult: jest.fn(),
      getDueRecommendations: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: ReviewsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(ReviewsService);
  });

  it('returns generic not found for an ineligible quiz', async () => {
    repository.startQuizSession.mockResolvedValue(null);
    await expect(
      service.startQuizSession('user', 'quiz'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps an existing active session to conflict', async () => {
    repository.startQuizSession.mockRejectedValue(
      new ActiveReviewSessionConflictError(),
    );
    await expect(
      service.startQuizSession('user', 'quiz'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('calculates quiz progress with two-decimal percent rounding', async () => {
    repository.getSessionState.mockResolvedValue({
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 2,
      totalQuestions: 3,
      nextQuestion: { id: 'next' },
    });
    await expect(service.getSession('user', 'session')).resolves.toEqual({
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      progress: {
        answeredCount: 2,
        totalQuestions: 3,
        remainingCount: 1,
        progressPercent: 66.67,
      },
      nextQuestion: { id: 'next' },
    });
  });

  it('omits nextQuestion when unavailable and handles zero questions', async () => {
    repository.getSessionState.mockResolvedValue({
      session: { id: 'session', status: ReviewSessionStatus.COMPLETED },
      answeredCount: 0,
      totalQuestions: 0,
    });
    const result = await service.getSession('user', 'session');
    expect(result.progress.progressPercent).toBe(0);
    expect(result).not.toHaveProperty('nextQuestion');
  });

  it('rejects an inverted history date range before querying', async () => {
    await expect(
      service.getHistory('user', {
        page: 1,
        limit: 20,
        from: '2026-07-25T00:00:00Z',
        to: '2026-07-24T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.listHistory).not.toHaveBeenCalled();
  });
});
