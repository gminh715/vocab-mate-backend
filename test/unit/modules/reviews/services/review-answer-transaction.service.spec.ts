/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  LearningStatus,
  QuestionType,
  ReviewSessionItemStatus,
  ReviewSessionStatus,
  ReviewSkillDimension,
} from '../../../../../generated/prisma/enums';
import {
  ReviewSubmissionConflictError,
  type ReviewAnswerSubmissionContext,
  type ReviewSessionsRepository,
} from '../../../../../src/modules/reviews/repositories/review-sessions.repository';
import { InvalidAnswerShapeError } from '../../../../../src/modules/reviews/services/answer-grading.service';
import { ReviewAnswerTransactionService } from '../../../../../src/modules/reviews/services/review-answer-transaction.service';

describe('ReviewAnswerTransactionService', () => {
  const sessions = {
    getAnswerSubmissionContext: jest.fn(),
    commitAnswerSubmission: jest.fn(),
    getAnswerDiagnosisSkillAggregates: jest.fn(),
    getSkipItemContext: jest.fn(),
    skipItem: jest.fn(),
  };
  const grading = { grade: jest.fn() };
  const scoring = { inferScore: jest.fn(), schedule: jest.fn() };
  const questionSelection = {
    skillDimensionFor: jest.fn(),
    preferredTypes: jest.fn(),
  };
  const service = new ReviewAnswerTransactionService(
    sessions as unknown as ReviewSessionsRepository,
    grading as never,
    scoring,
    questionSelection as never,
  );
  const dto = {
    reviewSessionItemId: 'item',
    reviewQuestionId: 'question',
    selectedOptionId: 'option',
    hintsUsed: 0,
  };
  const context = (): ReviewAnswerSubmissionContext =>
    ({
      session: {
        id: 'session',
        status: ReviewSessionStatus.IN_PROGRESS,
      },
      item: {
        id: 'item',
        userVocabularyId: 'vocabulary',
        retryCount: 0,
        answerCount: 0,
        sequenceNumber: 1,
        question: {
          id: 'question',
          articleSentenceTermId: 'term',
          questionType: QuestionType.SELECT_MEANING,
          correctAnswerText: null,
          answerExplanation: null,
          isCaseSensitive: false,
          points: 2,
          options: [
            {
              id: 'option',
              optionText: 'Correct',
              isCorrect: true,
              explanation: null,
            },
          ],
        },
      },
      vocabulary: {
        id: 'vocabulary',
        learningStatus: LearningStatus.REVIEWING,
        reviewIntervalDays: 2,
        consecutiveCorrectReviews: 1,
        lapseCount: 0,
        lastReviewScore: 4,
        articleSentenceTermId: 'term',
        savedWordDisplay: 'word',
        savedLemma: 'word',
        savedPartOfSpeech: 'noun',
        savedMeaningVi: 'meaning',
        savedContextSentence: 'A word here.',
        savedExplanation: null,
        savedCefrLevel: 'B1',
        articleSentenceTerm: {
          sentence: { article: { categoryId: 'category' } },
        },
      },
      pendingItemsAfterCurrent: [],
      recentAttempts: [],
      retryQuestionCandidates: [],
    }) as unknown as ReviewAnswerSubmissionContext;

  beforeEach(() => {
    jest.resetAllMocks();
    sessions.getAnswerSubmissionContext.mockResolvedValue(context());
    sessions.commitAnswerSubmission.mockResolvedValue({
      answerId: 'answer',
      sessionCompleted: false,
    });
    sessions.getAnswerDiagnosisSkillAggregates.mockResolvedValue([]);
    sessions.getSkipItemContext.mockResolvedValue({
      vocabulary: context().vocabulary,
      retryCount: 0,
    });
    grading.grade.mockReturnValue({
      isCorrect: true,
      correctAnswer: 'Correct',
      explanation: 'Explanation',
      earnedPoints: 2,
      normalizedUserAnswerText: null,
      selectedOptionId: 'option',
    });
    scoring.inferScore.mockReturnValue(4);
    scoring.schedule.mockReturnValue({
      learningStatus: LearningStatus.REVIEWING,
      reviewIntervalDays: 4,
      lastReviewedAt: new Date(),
      nextReviewAt: new Date(),
      consecutiveCorrectReviews: 2,
      lapseCount: 0,
      lastReviewScore: 4,
    });
    questionSelection.skillDimensionFor.mockReturnValue(
      ReviewSkillDimension.RECOGNITION,
    );
  });

  it('loads context, grades the answer, and commits computed decisions', async () => {
    await expect(service.submit('user', 'session', dto)).resolves.toMatchObject(
      {
        answerId: 'answer',
        isCorrect: true,
        correctAnswer: 'Correct',
        inferredReviewScore: 4,
      },
    );
    expect(sessions.getAnswerSubmissionContext).toHaveBeenCalledWith(
      'user',
      'session',
      dto,
    );
    expect(grading.grade).toHaveBeenCalledWith(
      context().item.question,
      expect.objectContaining({ selectedOptionId: 'option' }),
    );
    expect(scoring.inferScore).toHaveBeenCalledWith(
      expect.objectContaining({
        isCorrect: true,
        previousFailedAttempts: 0,
        hintsUsed: 0,
        questionType: QuestionType.SELECT_MEANING,
        responseTimeMs: null,
      }),
    );
    expect(sessions.commitAnswerSubmission).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        answer: expect.objectContaining({
          isCorrect: true,
          inferredReviewScore: 4,
          skillDimension: ReviewSkillDimension.RECOGNITION,
        }),
        item: expect.objectContaining({
          status: ReviewSessionItemStatus.COMPLETED,
        }),
      }),
    );
  });

  it('does not commit when grading rejects the answer shape', async () => {
    grading.grade.mockImplementation(() => {
      throw new InvalidAnswerShapeError('Invalid answer');
    });

    await expect(service.submit('user', 'session', dto)).rejects.toBeInstanceOf(
      InvalidAnswerShapeError,
    );
    expect(sessions.commitAnswerSubmission).not.toHaveBeenCalled();
  });

  it('propagates repository conflicts unchanged', async () => {
    const conflict = new ReviewSubmissionConflictError();
    sessions.commitAnswerSubmission.mockRejectedValue(conflict);

    await expect(service.submit('user', 'session', dto)).rejects.toBe(conflict);
  });

  it('preserves the incorrect-answer retest decision path', async () => {
    const incorrectContext = context();
    incorrectContext.pendingItemsAfterCurrent = [
      { id: 'next-1', sequenceNumber: 2 },
      { id: 'next-2', sequenceNumber: 3 },
    ];
    incorrectContext.retryQuestionCandidates = [
      { id: 'retest', questionType: QuestionType.SELECT_WORD },
    ];
    sessions.getAnswerSubmissionContext.mockResolvedValue(incorrectContext);
    grading.grade.mockReturnValue({
      isCorrect: false,
      correctAnswer: 'Correct',
      explanation: 'Explanation',
      earnedPoints: 0,
      normalizedUserAnswerText: null,
      selectedOptionId: 'option',
    });
    scoring.inferScore.mockReturnValue(0);
    questionSelection.preferredTypes.mockReturnValue([
      QuestionType.SELECT_WORD,
    ]);

    await expect(service.submit('user', 'session', dto)).resolves.toMatchObject(
      {
        isCorrect: false,
        willReturnLater: true,
        diagnosisSnapshot: expect.objectContaining({
          fallbackRetestQuestionType: QuestionType.SELECT_WORD,
          fallbackRetestAfterItems: 2,
        }),
      },
    );
    expect(questionSelection.preferredTypes).toHaveBeenCalledWith(
      incorrectContext.vocabulary,
      [],
      QuestionType.SELECT_MEANING,
    );
    expect(sessions.commitAnswerSubmission).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        item: expect.objectContaining({
          status: ReviewSessionItemStatus.PENDING,
          retryCount: 1,
          retryQuestionId: 'retest',
          moveAfterPendingItems: 2,
        }),
      }),
    );
  });

  it('keeps skip transitions on the same session transaction boundary', async () => {
    sessions.skipItem.mockResolvedValue({
      inferredReviewScore: 0,
      status: ReviewSessionItemStatus.SKIPPED,
    });
    scoring.schedule.mockReturnValue({
      learningStatus: LearningStatus.LEARNING,
      reviewIntervalDays: 1,
      lastReviewedAt: new Date(),
      nextReviewAt: new Date(),
      consecutiveCorrectReviews: 0,
      lapseCount: 1,
      lastReviewScore: 0,
    });
    const dto = {
      reviewSessionItemId: 'item',
      reviewQuestionId: 'question',
      reason: 'Need more time',
    };

    await expect(service.skip('user', 'session', dto)).resolves.toEqual(
      expect.objectContaining({ inferredReviewScore: 0 }),
    );
    expect(sessions.getSkipItemContext).toHaveBeenCalledWith(
      'user',
      'session',
      dto,
    );
    expect(sessions.skipItem).toHaveBeenCalledWith(
      'user',
      'session',
      dto,
      expect.objectContaining({ lastReviewScore: 0 }),
    );
    expect(grading.grade).not.toHaveBeenCalled();
    expect(scoring.inferScore).not.toHaveBeenCalled();
    expect(scoring.schedule).toHaveBeenCalledWith(
      0,
      context().vocabulary,
      expect.any(Date),
      true,
    );
    expect(questionSelection.preferredTypes).not.toHaveBeenCalled();
  });
});
