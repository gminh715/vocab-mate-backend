import { ReviewSessionsRepository } from '../../../../../src/modules/reviews/repositories/review-sessions.repository';
import { ReviewAnswerTransactionService } from '../../../../../src/modules/reviews/services/review-answer-transaction.service';
import { ReviewSessionItemStatus } from '../../../../../generated/prisma/enums';

describe('ReviewAnswerTransactionService', () => {
  const sessions = {
    submitAnswer: jest.fn(),
    skipItem: jest.fn(),
  };
  const service = new ReviewAnswerTransactionService(
    sessions as unknown as ReviewSessionsRepository,
  );

  beforeEach(() => jest.clearAllMocks());

  it('keeps answer submission on the session transaction boundary', async () => {
    sessions.submitAnswer.mockResolvedValue({
      answerId: 'answer',
      sessionCompleted: false,
    });
    const dto = {
      reviewSessionItemId: 'item',
      quizQuestionId: 'question',
      selectedOptionId: 'option',
      hintsUsed: 0,
    };

    await expect(service.submit('user', 'session', dto)).resolves.toEqual({
      answerId: 'answer',
      sessionCompleted: false,
    });
    expect(sessions.submitAnswer).toHaveBeenCalledWith('user', 'session', dto);
  });

  it('keeps skip transitions on the same session transaction boundary', async () => {
    sessions.skipItem.mockResolvedValue({
      inferredReviewScore: 0,
      status: ReviewSessionItemStatus.SKIPPED,
    });
    const dto = {
      reviewSessionItemId: 'item',
      quizQuestionId: 'question',
      reason: 'Need more time',
    };

    await expect(service.skip('user', 'session', dto)).resolves.toEqual(
      expect.objectContaining({ inferredReviewScore: 0 }),
    );
    expect(sessions.skipItem).toHaveBeenCalledWith('user', 'session', dto);
  });
});
