/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test } from '@nestjs/testing';
import type { AiConfig } from '../../../../../src/config/ai.config';
import { AI_CONFIG } from '../../../../../src/config/config.module';
import type {
  DiagnoseReviewAnswerInput,
  PlanReviewSessionInput,
  ReviewAnswerDiagnosisResult,
} from '../../../../../src/modules/ai/ai.contracts';
import { AiService } from '../../../../../src/modules/ai/services/ai.service';
import { ReviewDecisionSource } from '../../../../../generated/prisma/enums';
import { ReviewAgentRepository } from '../../../../../src/modules/reviews/repositories/review-agent.repository';
import { ReviewAgentService } from '../../../../../src/modules/reviews/services/review-agent.service';

const config: AiConfig = {
  geminiApiKey: 'gemini-test-key',
  geminiModel: 'gemini-test-model',
  groqApiKey: 'groq-test-key',
  groqModel: 'groq-test-model',
  requestTimeoutMs: 5_000,
  reviewAgentEnabled: true,
  reviewMaxCallsPerSession: 6,
  reviewMaxDiagnosisCalls: 4,
  reviewMinConfidence: 0.65,
  reviewPromptVersion: 'review-agent-test-v2',
  reviewQuestionWarmLimit: 2,
};

const planInput: PlanReviewSessionInput = {
  targetCefr: 'B1',
  reviewGoal: 'BALANCED',
  targetDurationMinutes: 10,
  maxItemCount: 2,
  allowedFocusDimensions: ['RECALL', 'SPELLING'],
  candidates: [
    {
      alias: 'v1',
      wordOrPhrase: 'engaging',
      lemma: 'engage',
      partOfSpeech: 'adjective',
      contextualMeaningVi: 'hap dan',
      originalSentence: 'The lesson was engaging for everyone.',
      daysOverdue: 4,
      lapseCount: 2,
      recentAttempts: [],
    },
    {
      alias: 'v2',
      wordOrPhrase: 'ambitious',
      lemma: 'ambitious',
      partOfSpeech: 'adjective',
      contextualMeaningVi: 'day tham vong',
      originalSentence: 'They announced an ambitious plan.',
      daysOverdue: 2,
      lapseCount: 1,
      recentAttempts: [],
    },
  ],
  skillAggregates: [
    {
      skillDimension: 'RECALL',
      attempts: 6,
      correct: 3,
      averageResponseTimeMs: 5_100,
    },
  ],
};

const diagnosisInput: DiagnoseReviewAnswerInput = {
  targetCefr: 'B1',
  wordOrPhrase: 'engaging',
  lemma: 'engage',
  partOfSpeech: 'adjective',
  contextualMeaningVi: 'hap dan',
  originalSentence: 'The lesson was engaging for everyone.',
  questionType: 'SELECT_WORD',
  learnerAnswer: 'interesting',
  correctAnswer: 'engaging',
  responseTimeMs: 6_200,
  hintsUsed: 1,
  attemptNumber: 1,
  recentAttempts: [
    {
      questionType: 'SELECT_WORD',
      skillDimension: 'RECALL',
      isCorrect: false,
      responseTimeMs: 5_800,
      hintsUsed: 0,
    },
  ],
  skillAggregates: planInput.skillAggregates,
  allowedSkillDimensions: ['RECALL', 'SPELLING'],
  allowedActions: [
    'CONTINUE',
    'REQUEUE_WITH_NEW_TYPE',
    'TEACH_AND_REQUEUE',
    'FLAG_FOR_FUTURE_FOCUS',
  ],
  allowedRetestQuestionTypes: ['FILL_BLANK', 'SELECT_CORRECT_CONTEXT'],
  allowedRetestAfterItems: [2, 3, 4, 5],
};

const diagnosisResult: ReviewAnswerDiagnosisResult = {
  action: 'TEACH_AND_REQUEUE',
  skillDimension: 'RECALL',
  errorType: 'LOW_RECALL',
  confidence: 0.84,
  reasonCode: 'RECOGNIZED_BUT_NOT_RECALLED',
  microLesson: {
    title: 'Recall engaging',
    explanation: 'Engaging means that something holds your attention.',
    example: 'The speaker told an engaging story.',
  },
  retest: { questionType: 'FILL_BLANK', afterItems: 3 },
};

describe('ReviewAgentService', () => {
  let service: ReviewAgentService;
  let ai: {
    planReviewSession: jest.MockedFunction<AiService['planReviewSession']>;
    diagnoseReviewAnswer: jest.MockedFunction<
      AiService['diagnoseReviewAnswer']
    >;
  };
  let repository: {
    reserveCall: jest.Mock;
    reserveDiagnosisCall: jest.Mock;
    persist: jest.Mock;
    applyAnswerDecision: jest.Mock;
  };

  beforeEach(async () => {
    ai = {
      planReviewSession: jest.fn(),
      diagnoseReviewAnswer: jest.fn(),
    };
    repository = {
      reserveCall: jest.fn().mockResolvedValue(true),
      reserveDiagnosisCall: jest.fn().mockResolvedValue(true),
      persist: jest.fn(),
      applyAnswerDecision: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ReviewAgentService,
        { provide: AI_CONFIG, useValue: config },
        { provide: AiService, useValue: ai },
        {
          provide: ReviewAgentRepository,
          useValue: {
            reserveCall: (...args: unknown[]) =>
              repository.reserveCall(...args),
            reserveDiagnosisCall: (...args: unknown[]) =>
              repository.reserveDiagnosisCall(...args),
            persist: (...args: unknown[]) => repository.persist(...args),
            applyAnswerDecision: (...args: unknown[]) =>
              repository.applyAnswerDecision(...args),
          },
        },
      ],
    }).compile();
    service = module.get(ReviewAgentService);
  });

  it('persists a completed session-plan decision after its decision phase', async () => {
    const decision = { reviewSessionId: 'session', source: 'AI' };
    jest.spyOn(service, 'planSession').mockResolvedValue(decision as never);
    repository.persist.mockResolvedValue({ created: true });

    await expect(
      service.persistSessionPlan({
        userId: 'user',
        reviewSessionId: 'session',
        input: planInput,
      }),
    ).resolves.toEqual({ created: true });
    expect(repository.persist).toHaveBeenCalledWith('user', decision);
  });

  it('does not create a decision when diagnosis is not useful', async () => {
    const decision = await service.diagnoseAnswer({
      userId: 'user',
      reviewSessionId: 'session',
      reviewSessionItemId: 'item',
      reviewAnswerId: 'answer',
      isCorrect: false,
      wasSkipped: false,
      lapseCount: 0,
      input: { ...diagnosisInput, recentAttempts: [] },
    });

    expect(decision).toBeNull();
    expect(repository.reserveDiagnosisCall).not.toHaveBeenCalled();
    expect(ai.diagnoseReviewAnswer).not.toHaveBeenCalled();
  });

  it('does not create a decision when the atomic budget is exhausted', async () => {
    repository.reserveDiagnosisCall.mockResolvedValue(false);

    const decision = await service.diagnoseAnswer({
      userId: 'user',
      reviewSessionId: 'session',
      reviewSessionItemId: 'item',
      reviewAnswerId: 'answer',
      isCorrect: false,
      wasSkipped: false,
      lapseCount: 1,
      input: diagnosisInput,
    });

    expect(repository.reserveDiagnosisCall).toHaveBeenCalledWith(
      'user',
      'session',
      6,
      4,
    );
    expect(decision).toBeNull();
    expect(ai.diagnoseReviewAnswer).not.toHaveBeenCalled();
  });

  it('rejects a low-confidence AI decision', async () => {
    ai.diagnoseReviewAnswer.mockResolvedValue({
      result: { ...diagnosisResult, confidence: 0.64 },
      metadata: {
        provider: 'GEMINI',
        model: 'gemini-test-model',
        promptVersion: 'review-answer-diagnosis-v1',
      },
    });

    const decision = await service.diagnoseAnswer({
      userId: 'user',
      reviewSessionId: 'session',
      reviewSessionItemId: 'item',
      reviewAnswerId: 'answer',
      isCorrect: false,
      wasSkipped: false,
      lapseCount: 1,
      input: diagnosisInput,
    });

    expect(decision).toBeNull();
  });

  it('rejects an invalid AI decision even if the AI boundary is mocked', async () => {
    ai.diagnoseReviewAnswer.mockResolvedValue({
      result: { ...diagnosisResult, action: 'DELETE_SESSION' },
      metadata: {
        provider: 'GEMINI',
        model: 'gemini-test-model',
        promptVersion: 'review-answer-diagnosis-v1',
      },
    });

    await expect(
      service.diagnoseAnswer({
        userId: 'user',
        reviewSessionId: 'session',
        reviewSessionItemId: 'item',
        reviewAnswerId: 'answer',
        isCorrect: false,
        wasSkipped: false,
        lapseCount: 1,
        input: diagnosisInput,
      }),
    ).resolves.toBeNull();
  });

  it('keeps Groq provenance when AiService succeeds through provider fallback', async () => {
    ai.diagnoseReviewAnswer.mockResolvedValue({
      result: diagnosisResult,
      metadata: {
        provider: 'GROQ',
        model: 'groq-test-model',
        promptVersion: 'review-answer-diagnosis-v1',
      },
    });

    await expect(
      service.diagnoseAnswer({
        userId: 'user',
        reviewSessionId: 'session',
        reviewSessionItemId: 'item',
        reviewAnswerId: 'answer',
        isCorrect: false,
        wasSkipped: false,
        lapseCount: 1,
        input: diagnosisInput,
      }),
    ).resolves.toMatchObject({
      source: ReviewDecisionSource.AI,
      provider: 'GROQ',
      model: 'groq-test-model',
      reasonCode: diagnosisResult.reasonCode,
    });
  });

  it('clamps a second-attempt AI requeue to the server no-requeue policy', async () => {
    ai.diagnoseReviewAnswer.mockResolvedValue({
      result: diagnosisResult,
      metadata: {
        provider: 'GEMINI',
        model: 'gemini-test-model',
        promptVersion: 'review-answer-diagnosis-v1',
      },
    });

    await expect(
      service.diagnoseAnswer({
        userId: 'user',
        reviewSessionId: 'session',
        reviewSessionItemId: 'item',
        reviewAnswerId: 'answer',
        isCorrect: false,
        wasSkipped: false,
        lapseCount: 1,
        input: { ...diagnosisInput, attemptNumber: 2 },
      }),
    ).resolves.toMatchObject({
      source: ReviewDecisionSource.AI,
      action: 'FLAG_FOR_FUTURE_FOCUS',
      reasonCode: 'SECOND_ATTEMPT_NO_REQUEUE',
      decisionPayload: { microLesson: null, retest: null },
    });
  });

  it('does not create a decision when both providers fail', async () => {
    ai.diagnoseReviewAnswer.mockRejectedValue(
      new Error('provider response must not escape'),
    );

    const decision = await service.diagnoseAnswer({
      userId: 'user',
      reviewSessionId: 'session',
      reviewSessionItemId: 'item',
      reviewAnswerId: 'answer',
      isCorrect: false,
      wasSkipped: false,
      lapseCount: 1,
      input: diagnosisInput,
    });

    expect(decision).toBeNull();
  });

  it('uses AI to classify an obvious typo', async () => {
    ai.diagnoseReviewAnswer.mockResolvedValue({
      result: {
        ...diagnosisResult,
        errorType: 'SPELLING_ERROR',
        reasonCode: 'AI_SPELLING_ERROR',
        retest: { questionType: 'SELECT_WORD', afterItems: 3 },
      },
      metadata: {
        provider: 'GEMINI',
        model: 'gemini-test-model',
        promptVersion: 'review-answer-diagnosis-v1',
      },
    });
    const decision = await service.diagnoseAnswer({
      userId: 'user',
      reviewSessionId: 'session',
      reviewSessionItemId: 'item',
      reviewAnswerId: 'answer',
      isCorrect: false,
      wasSkipped: false,
      lapseCount: 2,
      input: {
        ...diagnosisInput,
        questionType: 'FILL_BLANK',
        learnerAnswer: 'engagin',
        allowedRetestQuestionTypes: ['SELECT_WORD'],
      },
    });

    expect(decision).toMatchObject({
      source: ReviewDecisionSource.AI,
      errorType: 'SPELLING_ERROR',
      reasonCode: 'AI_SPELLING_ERROR',
    });
    expect(repository.reserveDiagnosisCall).toHaveBeenCalled();
  });

  it('does not create a session plan when the shared slot budget is exhausted', async () => {
    repository.reserveCall.mockResolvedValue(false);

    await expect(
      service.planSession({
        userId: 'user',
        reviewSessionId: 'session',
        input: planInput,
      }),
    ).resolves.toBeNull();
    expect(repository.reserveCall).toHaveBeenCalledWith('user', 'session', 6);
    expect(ai.planReviewSession).not.toHaveBeenCalled();
  });

  it('does not create a session plan when both structured providers are unavailable', async () => {
    ai.planReviewSession.mockRejectedValue(
      new Error('provider response must not escape'),
    );

    const decision = await service.planSession({
      userId: 'user',
      reviewSessionId: 'session',
      input: planInput,
    });

    expect(decision).toBeNull();
  });

  it('sends and persists only the sanitized bounded snapshot', async () => {
    ai.planReviewSession.mockResolvedValue({
      result: {
        reviewGoal: 'BALANCED',
        focusDimensions: ['RECALL'],
        orderedCandidateAliases: ['v1', 'v2'],
        summary: 'Review recall first.',
        confidence: 0.9,
      },
      metadata: {
        provider: 'GEMINI',
        model: 'gemini-test-model',
        promptVersion: 'review-session-plan-v1',
      },
    });
    const unsafeInput = Object.assign({}, planInput, {
      userIdentity: { email: 'learner@example.com' },
      accessToken: 'secret-token',
      fullArticle: 'unrelated article body',
    });

    const decision = await service.planSession({
      userId: 'private-user-id',
      reviewSessionId: 'private-session-id',
      input: unsafeInput,
    });
    if (!decision) throw new Error('Expected an accepted AI decision');

    const providerInput = ai.planReviewSession.mock.calls[0][0];
    for (const value of [providerInput, decision.stateSnapshot]) {
      const serialized = JSON.stringify(value);
      expect(serialized).not.toContain('learner@example.com');
      expect(serialized).not.toContain('secret-token');
      expect(serialized).not.toContain('unrelated article body');
      expect(serialized).not.toContain('private-user-id');
      expect(serialized).not.toContain('private-session-id');
    }
  });
});
