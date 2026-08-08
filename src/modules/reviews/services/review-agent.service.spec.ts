import { Test } from '@nestjs/testing';
import type { AiConfig } from '../../../config/ai.config';
import { AI_CONFIG } from '../../../config/config.module';
import type {
  DiagnoseReviewAnswerInput,
  PlanReviewSessionInput,
  ReviewAnswerDiagnosisResult,
} from '../../ai/ai.contracts';
import { AiService } from '../../ai/ai.service';
import {
  ReviewDecisionSource,
  ReviewErrorType,
} from '../../../../generated/prisma/enums';
import { ReviewsRepository } from '../reviews.repository';
import { ReviewAgentService } from './review-agent.service';

const config: AiConfig = {
  geminiApiKey: 'gemini-test-key',
  geminiModel: 'gemini-test-model',
  groqApiKey: 'groq-test-key',
  groqModel: 'groq-test-model',
  requestTimeoutMs: 5_000,
  maxArticleCharacters: 50_000,
  maxTermsPerArticle: 25,
  reviewAgentEnabled: true,
  reviewMaxCallsPerSession: 6,
  reviewMaxDiagnosisCalls: 4,
  reviewMinConfidence: 0.65,
  reviewDefaultDurationMinutes: 10,
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
    reserveAiCallSlot: jest.Mock;
    reserveDiagnosisAiCallSlot: jest.Mock;
  };

  beforeEach(async () => {
    ai = {
      planReviewSession: jest.fn(),
      diagnoseReviewAnswer: jest.fn(),
    };
    repository = {
      reserveAiCallSlot: jest.fn().mockResolvedValue(true),
      reserveDiagnosisAiCallSlot: jest.fn().mockResolvedValue(true),
    };
    const module = await Test.createTestingModule({
      providers: [
        ReviewAgentService,
        { provide: AI_CONFIG, useValue: config },
        { provide: AiService, useValue: ai },
        { provide: ReviewsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(ReviewAgentService);
  });

  it('uses a RULE decision without a call when diagnosis is not useful', async () => {
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

    expect(decision).toMatchObject({
      source: ReviewDecisionSource.RULE,
      reasonCode: 'CALL_NOT_USEFUL',
    });
    expect(repository.reserveDiagnosisAiCallSlot).not.toHaveBeenCalled();
    expect(ai.diagnoseReviewAnswer).not.toHaveBeenCalled();
  });

  it('returns a deterministic RULE decision when the atomic budget is exhausted', async () => {
    repository.reserveDiagnosisAiCallSlot.mockResolvedValue(false);

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

    expect(repository.reserveDiagnosisAiCallSlot).toHaveBeenCalledWith(
      'user',
      'session',
      6,
      4,
    );
    expect(decision).toMatchObject({
      source: ReviewDecisionSource.RULE,
      reasonCode: 'BUDGET_EXHAUSTED',
      provider: null,
    });
    expect(ai.diagnoseReviewAnswer).not.toHaveBeenCalled();
  });

  it('falls back after a low-confidence decision and retains safe provider audit data', async () => {
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

    expect(decision).toMatchObject({
      source: ReviewDecisionSource.RULE,
      reasonCode: 'LOW_CONFIDENCE',
      confidence: 0.64,
      provider: 'GEMINI',
      model: 'gemini-test-model',
    });
  });

  it('falls back when an AI decision is invalid even if the AI boundary is mocked', async () => {
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
    ).resolves.toMatchObject({
      source: ReviewDecisionSource.RULE,
      reasonCode: 'INVALID_AI_DECISION',
      action: 'REQUEUE_WITH_NEW_TYPE',
      provider: 'GEMINI',
    });
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

  it('uses a non-question deterministic fallback when both providers fail', async () => {
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

    expect(decision).toMatchObject({
      source: ReviewDecisionSource.RULE,
      reasonCode: 'AI_UNAVAILABLE',
      provider: null,
      decisionPayload: {
        action: 'REQUEUE_WITH_NEW_TYPE',
        microLesson: null,
      },
    });
    expect(JSON.stringify(decision)).not.toContain('provider response');
    expect(decision.decisionPayload).not.toHaveProperty('prompt');
    expect(decision.decisionPayload).not.toHaveProperty('options');
  });

  it('classifies an obvious typo deterministically without spending a slot', async () => {
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
      source: ReviewDecisionSource.RULE,
      errorType: ReviewErrorType.SPELLING_ERROR,
      reasonCode: 'OBVIOUS_SPELLING_ERROR',
    });
    expect(repository.reserveDiagnosisAiCallSlot).not.toHaveBeenCalled();
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
