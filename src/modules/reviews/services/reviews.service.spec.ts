import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  QuestionType,
  ReviewAgentAction,
  ReviewDecisionKind,
  ReviewDecisionSource,
  ReviewErrorType,
  ReviewSessionStatus,
  ReviewSessionType,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import {
  InvalidReviewSourceShapeError,
  NoUsableReviewQuestionError,
  ReviewAgentDecisionConflictError,
  ReviewsRepository,
} from '../reviews.repository';
import { ReviewsService } from './reviews.service';
import { AiAssistedQuestionGeneratorService } from './ai-assisted-question-generator.service';
import { ReviewAgentService } from './review-agent.service';

const diagnosisSnapshot = {
  request: {
    reviewSessionItemId: 'item',
    reviewAnswerId: 'answer',
    isCorrect: false as const,
    wasSkipped: false as const,
    lapseCount: 2,
    input: {
      targetCefr: 'B1' as const,
      wordOrPhrase: 'economic',
      lemma: 'economic',
      partOfSpeech: 'adjective',
      contextualMeaningVi: 'thuoc kinh te',
      originalSentence: 'The country faces economic pressure.',
      questionType: QuestionType.SELECT_MEANING,
      learnerAnswer: 'economical',
      correctAnswer: 'economic',
      responseTimeMs: 4_200,
      hintsUsed: 0,
      attemptNumber: 1,
      recentAttempts: [],
      skillAggregates: [],
      allowedSkillDimensions: [
        ReviewSkillDimension.RECOGNITION,
        ReviewSkillDimension.CONTEXT,
      ],
      allowedActions: [
        ReviewAgentAction.CONTINUE,
        ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
        ReviewAgentAction.TEACH_AND_REQUEUE,
        ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS,
      ],
      allowedRetestQuestionTypes: [
        QuestionType.SELECT_WORD,
        QuestionType.FILL_BLANK,
      ],
      allowedRetestAfterItems: [2, 3, 4, 5] as const,
    },
  },
  vocabulary: {
    id: 'vocabulary',
    articleSentenceTermId: 'term',
    savedWordDisplay: 'economic',
    savedLemma: 'economic',
    savedPartOfSpeech: 'adjective',
    savedCefrLevel: 'B1' as const,
    savedContextSentence: 'The country faces economic pressure.',
    savedMeaningVi: 'thuoc kinh te',
    savedExplanation: null,
    categoryId: 'category',
  },
  originalQuestionType: QuestionType.SELECT_MEANING,
  fallbackRetestQuestionType: QuestionType.SELECT_WORD,
  fallbackRetestAfterItems: 3 as const,
  attemptNumber: 1,
};

const aiDecision = {
  reviewSessionId: 'session',
  reviewSessionItemId: 'item',
  reviewAnswerId: 'answer',
  kind: ReviewDecisionKind.ANSWER_INTERVENTION,
  source: ReviewDecisionSource.AI,
  action: ReviewAgentAction.TEACH_AND_REQUEUE,
  skillDimension: ReviewSkillDimension.CONTEXT,
  errorType: ReviewErrorType.CONFUSABLE_WORD,
  confidence: 0.9,
  reasonCode: 'CONFUSABLE_CONTEXT',
  stateSnapshot: {},
  decisionPayload: {
    action: ReviewAgentAction.TEACH_AND_REQUEUE,
    microLesson: {
      title: 'Economic or economical?',
      explanation: 'Economic relates to the economy.',
      example: 'The country faces economic pressure.',
    },
    retest: { questionType: QuestionType.FILL_BLANK, afterItems: 4 },
  },
  provider: 'GEMINI',
  model: 'gemini-model',
  promptVersion: 'review-answer-diagnosis-v1',
  latencyMs: 100,
};

describe('ReviewsService', () => {
  let service: ReviewsService;
  let repository: Record<string, jest.Mock>;
  let aiQuestionGenerator: {
    warmCache: jest.Mock;
    prepareRetestQuestion: jest.Mock;
  };
  let reviewAgent: {
    planSession: jest.Mock;
    diagnoseAnswer: jest.Mock;
  };

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
      persistAgentDecision: jest.fn(),
      applyAnswerAgentDecision: jest.fn(),
    };
    aiQuestionGenerator = {
      warmCache: jest.fn().mockResolvedValue([]),
      prepareRetestQuestion: jest.fn().mockResolvedValue(null),
    };
    reviewAgent = {
      planSession: jest.fn(),
      diagnoseAnswer: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: ReviewsRepository, useValue: repository },
        {
          provide: AiAssistedQuestionGeneratorService,
          useValue: aiQuestionGenerator,
        },
        { provide: ReviewAgentService, useValue: reviewAgent },
      ],
    }).compile();
    service = module.get(ReviewsService);
  });

  it('persists a session-plan decision only after the provider phase finishes', async () => {
    const callOrder: string[] = [];
    const request = {
      userId: 'user',
      reviewSessionId: 'session',
      input: {
        targetCefr: 'B1' as const,
        reviewGoal: 'BALANCED' as const,
        targetDurationMinutes: 10 as const,
        maxItemCount: 1,
        allowedFocusDimensions: ['RECALL' as const],
        candidates: [
          {
            alias: 'v1',
            wordOrPhrase: 'word',
            lemma: 'word',
            partOfSpeech: 'noun',
            contextualMeaningVi: 'nghia',
            originalSentence: 'A word in context.',
            daysOverdue: 1,
            lapseCount: 0,
            recentAttempts: [],
          },
        ],
        skillAggregates: [],
      },
    };
    const decision = { reviewSessionId: 'session', source: 'AI' };
    reviewAgent.planSession.mockImplementation(() => {
      callOrder.push('provider-complete');
      return Promise.resolve(decision);
    });
    repository.persistAgentDecision.mockImplementation(() => {
      callOrder.push('persistence-transaction');
      return Promise.resolve({ decision: { id: 'decision' }, created: true });
    });

    await expect(service.createSessionPlanDecision(request)).resolves.toEqual({
      decision: { id: 'decision' },
      created: true,
    });
    expect(callOrder).toEqual(['provider-complete', 'persistence-transaction']);
    expect(repository.persistAgentDecision).toHaveBeenCalledWith(
      'user',
      decision,
    );
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

  it('finishes AI preparation before entering the session transaction', async () => {
    const callOrder: string[] = [];
    const prepared = [
      {
        userVocabularyId: 'vocabulary',
        quizQuestionId: 'ai-question',
        articleSentenceTermId: 'term',
        difficultyCefr: 'B1',
        questionType: 'SELECT_MEANING',
      },
    ];
    aiQuestionGenerator.warmCache.mockImplementation(() => {
      callOrder.push('provider-complete');
      return prepared;
    });
    repository.startSession.mockImplementation(() => {
      callOrder.push('transaction-start');
      return Promise.resolve({
        session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
        answeredCount: 0,
        totalQuestions: 1,
        nextItem: { id: 'item' },
      });
    });

    await service.startSession('user', {
      sessionType: ReviewSessionType.DAILY_REVIEW,
      limit: 20,
    });

    expect(callOrder).toEqual(['provider-complete', 'transaction-start']);
    expect(repository.startSession).toHaveBeenCalledWith(
      'user',
      expect.any(Object),
      expect.any(Date),
      prepared,
    );
  });

  it('returns a retryable 503 when eligible vocabulary has no usable AI question', async () => {
    repository.startSession.mockRejectedValue(
      new NoUsableReviewQuestionError(),
    );

    await expect(
      service.startSession('user', {
        sessionType: ReviewSessionType.DAILY_REVIEW,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
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
    expect(reviewAgent.diagnoseAnswer).not.toHaveBeenCalled();
  });

  it('does not invoke the review agent for a correct answer', async () => {
    repository.submitAnswer.mockResolvedValue({
      answerId: 'answer',
      isCorrect: true,
      correctAnswer: 'economic',
      explanation: 'Correct.',
      earnedPoints: 1,
      inferredReviewScore: 4,
      willReturnLater: false,
      sessionCompleted: false,
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 1,
      totalQuestions: 4,
      nextItem: { id: 'next-item' },
    });

    await service.submitAnswer('user', 'session', {
      reviewSessionItemId: 'item',
      quizQuestionId: 'question',
      selectedOptionId: 'correct-option',
    });

    expect(reviewAgent.diagnoseAnswer).not.toHaveBeenCalled();
    expect(repository.applyAnswerAgentDecision).not.toHaveBeenCalled();
  });

  it('commits grading before diagnosis and applies diagnosis, lesson, and retest afterward', async () => {
    const callOrder: string[] = [];
    repository.submitAnswer.mockImplementation(() => {
      callOrder.push('grading-transaction-committed');
      return Promise.resolve({
        answerId: 'answer',
        isCorrect: false,
        correctAnswer: 'economic',
        explanation: 'Economic relates to the economy.',
        earnedPoints: 0,
        inferredReviewScore: 0,
        willReturnLater: true,
        sessionCompleted: false,
        session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
        answeredCount: 0,
        totalQuestions: 5,
        nextItem: { id: 'next-1' },
        diagnosisSnapshot,
      });
    });
    reviewAgent.diagnoseAnswer.mockImplementation(() => {
      callOrder.push('diagnosis-provider-complete');
      return Promise.resolve(aiDecision);
    });
    const preparedRetestQuestion = {
      userVocabularyId: 'vocabulary',
      quizQuestionId: 'ai-retest',
      articleSentenceTermId: 'term',
      difficultyCefr: 'B1',
      questionType: QuestionType.FILL_BLANK,
    };
    aiQuestionGenerator.prepareRetestQuestion.mockImplementation(() => {
      callOrder.push('retest-provider-complete');
      return Promise.resolve(preparedRetestQuestion);
    });
    repository.applyAnswerAgentDecision.mockImplementation(() => {
      callOrder.push('enhancement-transaction');
      return Promise.resolve({
        session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
        answeredCount: 0,
        totalQuestions: 5,
        nextItem: { id: 'next-1' },
        agentFeedback: {
          source: ReviewDecisionSource.AI,
          action: ReviewAgentAction.TEACH_AND_REQUEUE,
          skillDimension: ReviewSkillDimension.CONTEXT,
          errorType: ReviewErrorType.CONFUSABLE_WORD,
          microLesson: aiDecision.decisionPayload.microLesson,
          retestAfterItems: 4,
        },
      });
    });

    await expect(
      service.submitAnswer('user', 'session', {
        reviewSessionItemId: 'item',
        quizQuestionId: 'question',
        selectedOptionId: 'wrong-option',
      }),
    ).resolves.toMatchObject({
      isCorrect: false,
      willReturnLater: true,
      agentFeedback: {
        source: ReviewDecisionSource.AI,
        errorType: ReviewErrorType.CONFUSABLE_WORD,
        microLesson: aiDecision.decisionPayload.microLesson,
        retestAfterItems: 4,
      },
    });
    expect(callOrder).toEqual([
      'grading-transaction-committed',
      'diagnosis-provider-complete',
      'retest-provider-complete',
      'enhancement-transaction',
    ]);
    expect(reviewAgent.diagnoseAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user',
        reviewSessionId: 'session',
        reviewAnswerId: 'answer',
      }),
    );
    expect(repository.applyAnswerAgentDecision).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        decision: aiDecision,
        originalQuestionType: QuestionType.SELECT_MEANING,
        expectedAttemptNumber: 1,
        preparedRetestQuestion,
      }),
    );
  });

  it('keeps the committed transition when the enhancement transaction conflicts', async () => {
    repository.submitAnswer.mockResolvedValue({
      answerId: 'answer',
      isCorrect: false,
      correctAnswer: 'economic',
      explanation: 'Economic relates to the economy.',
      earnedPoints: 0,
      inferredReviewScore: 0,
      willReturnLater: true,
      sessionCompleted: false,
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 0,
      totalQuestions: 5,
      nextItem: { id: 'deterministic-next' },
      diagnosisSnapshot,
    });
    reviewAgent.diagnoseAnswer.mockResolvedValue({
      ...aiDecision,
      decisionPayload: {
        ...aiDecision.decisionPayload,
        retest: {
          questionType: QuestionType.SELECT_WORD,
          afterItems: 3,
        },
      },
    });
    repository.applyAnswerAgentDecision.mockRejectedValue(
      new ReviewAgentDecisionConflictError(),
    );

    await expect(
      service.submitAnswer('user', 'session', {
        reviewSessionItemId: 'item',
        quizQuestionId: 'question',
        selectedOptionId: 'wrong-option',
      }),
    ).resolves.toMatchObject({
      isCorrect: false,
      willReturnLater: true,
      nextQuestion: { id: 'deterministic-next' },
    });
  });

  it('continues with persisted RULE feedback when diagnosis providers are unavailable', async () => {
    repository.submitAnswer.mockResolvedValue({
      answerId: 'answer',
      isCorrect: false,
      correctAnswer: 'economic',
      explanation: 'Economic relates to the economy.',
      earnedPoints: 0,
      inferredReviewScore: 0,
      willReturnLater: true,
      sessionCompleted: false,
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 0,
      totalQuestions: 5,
      nextItem: { id: 'deterministic-next' },
      diagnosisSnapshot,
    });
    const ruleDecision = {
      ...aiDecision,
      source: ReviewDecisionSource.RULE,
      action: ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
      errorType: ReviewErrorType.UNKNOWN,
      confidence: null,
      reasonCode: 'AI_UNAVAILABLE',
      provider: null,
      model: null,
      decisionPayload: {
        action: ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
        microLesson: null,
        retest: {
          questionType: QuestionType.SELECT_WORD,
          afterItems: 3,
        },
      },
    };
    reviewAgent.diagnoseAnswer.mockResolvedValue(ruleDecision);
    repository.applyAnswerAgentDecision.mockResolvedValue({
      session: { id: 'session', status: ReviewSessionStatus.IN_PROGRESS },
      answeredCount: 0,
      totalQuestions: 5,
      nextItem: { id: 'deterministic-next' },
      agentFeedback: {
        source: ReviewDecisionSource.RULE,
        action: ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
        skillDimension: ReviewSkillDimension.CONTEXT,
        errorType: ReviewErrorType.UNKNOWN,
        retestAfterItems: 3,
      },
    });

    await expect(
      service.submitAnswer('user', 'session', {
        reviewSessionItemId: 'item',
        quizQuestionId: 'question',
        selectedOptionId: 'wrong-option',
      }),
    ).resolves.toMatchObject({
      isCorrect: false,
      sessionCompleted: false,
      agentFeedback: {
        source: ReviewDecisionSource.RULE,
        retestAfterItems: 3,
      },
    });
    expect(aiQuestionGenerator.prepareRetestQuestion).not.toHaveBeenCalled();
    expect(repository.applyAnswerAgentDecision).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ decision: ruleDecision }),
    );
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
    expect(reviewAgent.diagnoseAnswer).not.toHaveBeenCalled();
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
