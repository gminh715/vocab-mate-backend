import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ReviewSessionStatus,
  ReviewSessionType,
} from '../../../../generated/prisma/enums';
import {
  InvalidReviewSourceShapeError,
  ReviewsRepository,
} from '../reviews.repository';
import { ReviewsService } from './reviews.service';
import { AiAssistedQuestionGeneratorService } from './ai-assisted-question-generator.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let repository: Record<string, jest.Mock>;
  let aiQuestionGenerator: { warmCache: jest.Mock };

  beforeEach(async () => {
    repository = {
      startSession: jest.fn(),
      getSessionState: jest.fn(),
      getActiveSessionState: jest.fn(),
      submitAnswer: jest.fn(),
      skipItem: jest.fn(),
      abandonSession: jest.fn(),
      listHistory: jest.fn(),
      getCompletedResult: jest.fn(),
      getDueRecommendations: jest.fn(),
    };
    aiQuestionGenerator = { warmCache: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: ReviewsRepository, useValue: repository },
        {
          provide: AiAssistedQuestionGeneratorService,
          useValue: aiQuestionGenerator,
        },
      ],
    }).compile();
    service = module.get(ReviewsService);
  });

  it('returns generic not found for an ineligible quiz', async () => {
    repository.startSession.mockResolvedValue(null);
    await expect(
      service.startSession('user', {
        sessionType: ReviewSessionType.QUIZ,
        quizId: 'quiz',
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(aiQuestionGenerator.warmCache).toHaveBeenCalledTimes(1);
  });

  it('returns a compatible in-progress session instead of treating it as a conflict', async () => {
    repository.startSession.mockResolvedValue({
      session: { id: 'existing', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 1,
      totalQuestions: 3,
      nextItem: { id: 'next-item' },
    });
    await expect(
      service.startSession('user', {
        sessionType: ReviewSessionType.DAILY_REVIEW,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      session: { id: 'existing' },
      progress: { answeredCount: 1, remainingCount: 2 },
      nextItem: { id: 'next-item' },
    });
  });

  it('maps mismatched source fields to a bad request', async () => {
    repository.startSession.mockRejectedValue(
      new InvalidReviewSourceShapeError(),
    );
    await expect(
      service.startSession('user', {
        sessionType: ReviewSessionType.DAILY_REVIEW,
        quizId: 'unexpected',
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calculates quiz progress with two-decimal percent rounding', async () => {
    repository.getSessionState.mockResolvedValue({
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 2,
      totalQuestions: 3,
      nextItem: { id: 'next' },
    });
    await expect(service.getSession('user', 'session')).resolves.toEqual({
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      progress: {
        answeredCount: 2,
        totalQuestions: 3,
        remainingCount: 1,
        progressPercent: 66.67,
      },
      nextItem: { id: 'next' },
    });
  });

  it('omits nextItem when unavailable and handles zero questions', async () => {
    repository.getSessionState.mockResolvedValue({
      session: { id: 'session', status: ReviewSessionStatus.COMPLETED },
      answeredCount: 0,
      totalQuestions: 0,
    });
    const result = await service.getSession('user', 'session');
    expect(result.progress.progressPercent).toBe(0);
    expect(result).not.toHaveProperty('nextItem');
  });

  it('gets the current user active session with the safe question state', async () => {
    repository.getActiveSessionState.mockResolvedValue({
      session: { id: 'active', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 0,
      totalQuestions: 1,
      nextItem: { id: 'item' },
    });

    await expect(service.getActiveSession('user')).resolves.toMatchObject({
      session: { id: 'active' },
      progress: { remainingCount: 1 },
      nextItem: { id: 'item' },
    });
  });

  it('returns answer feedback, progress, and the requeued next item together', async () => {
    repository.submitAnswer.mockResolvedValue({
      answerId: 'answer',
      isCorrect: false,
      correctAnswer: 'word',
      explanation: null,
      earnedPoints: 0,
      inferredReviewScore: 0,
      willReturnLater: true,
      sessionCompleted: false,
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 0,
      totalQuestions: 2,
      nextItem: { id: 'other-item', attemptNumber: 1 },
    });

    await expect(
      service.submitAnswer('user', 'session', {
        reviewSessionItemId: 'item',
        quizQuestionId: 'question',
        userAnswerText: 'wrong',
      }),
    ).resolves.toMatchObject({
      isCorrect: false,
      sessionCompleted: false,
      inferredReviewScore: 0,
      willReturnLater: true,
      progress: { answeredCount: 0, remainingCount: 2 },
      nextQuestion: { id: 'other-item' },
    });
    expect(aiQuestionGenerator.warmCache).not.toHaveBeenCalled();
  });

  it('returns skip progress and completion summary without creating an answer', async () => {
    repository.skipItem.mockResolvedValue({
      inferredReviewScore: 0,
      sessionCompleted: true,
      completionSummary: { score: 0, totalPoints: 1, accuracy: 0 },
      session: { id: 'session', status: ReviewSessionStatus.COMPLETED },
      answeredCount: 1,
      totalQuestions: 1,
    });

    await expect(
      service.skipItem('user', 'session', {
        reviewSessionItemId: 'item',
        quizQuestionId: 'question',
      }),
    ).resolves.toMatchObject({
      inferredReviewScore: 0,
      sessionCompleted: true,
      progress: { remainingCount: 0, progressPercent: 100 },
      completionSummary: { accuracy: 0 },
    });
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
