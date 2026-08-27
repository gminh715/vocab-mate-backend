import { Inject, Injectable } from '@nestjs/common';
import type { AiConfig } from '../../../config/ai.config';
import { AI_CONFIG } from '../../../config/config.module';
import type {
  DiagnoseReviewAnswerInput,
  PlanReviewSessionInput,
  ReviewAnswerDiagnosisResult,
  ReviewSessionPlanResult,
} from '../../ai/ai.contracts';
import { AiService } from '../../ai/services/ai.service';
import {
  parseReviewAnswerDiagnosisResult,
  parseReviewSessionPlanResult,
  validateDiagnoseReviewAnswerInput,
  validatePlanReviewSessionInput,
} from '../../ai/validation/review.validation';
import {
  QuestionType,
  ReviewAgentAction,
  ReviewDecisionKind,
  ReviewDecisionSource,
} from '../../../../generated/prisma/enums';
import {
  type ApplyAnswerAgentDecisionInput,
  type PersistReviewAgentDecisionInput,
  type ReviewAgentJsonObject,
  type ReviewAgentJsonValue,
  ReviewAgentRepository,
} from '../repositories/review-agent.repository';

export interface SessionPlanDecisionRequest {
  userId: string;
  reviewSessionId: string;
  input: PlanReviewSessionInput;
}

export interface AnswerDiagnosisDecisionRequest {
  userId: string;
  reviewSessionId: string;
  reviewSessionItemId: string;
  reviewAnswerId: string;
  isCorrect: boolean;
  wasSkipped: boolean;
  lapseCount: number;
  input: DiagnoseReviewAnswerInput;
}

interface ProviderAudit {
  provider: string | null;
  model: string | null;
  promptVersion: string;
  latencyMs: number | null;
  confidence?: number;
}

@Injectable()
export class ReviewAgentService {
  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    private readonly aiService: AiService,
    private readonly agentRepository: ReviewAgentRepository,
  ) {}

  async persistSessionPlan(request: SessionPlanDecisionRequest) {
    const decision = await this.planSession(request);
    return decision
      ? this.agentRepository.persist(request.userId, decision)
      : null;
  }

  async persistAnswerIntervention(request: AnswerDiagnosisDecisionRequest) {
    const decision = await this.diagnoseAnswer(request);
    return decision
      ? this.agentRepository.persist(request.userId, decision)
      : null;
  }

  applyAnswerDecision(userId: string, input: ApplyAnswerAgentDecisionInput) {
    return this.agentRepository.applyAnswerDecision(userId, input);
  }

  async planSession(
    request: SessionPlanDecisionRequest,
  ): Promise<PersistReviewAgentDecisionInput | null> {
    const input = this.sanitizePlanInput(request.input);
    validatePlanReviewSessionInput(input);

    if (!this.config.reviewAgentEnabled || input.candidates.length < 2) {
      return null;
    }
    if (!(await this.reserveCall(request.userId, request.reviewSessionId))) {
      return null;
    }

    const startedAt = Date.now();
    try {
      const operation = await this.aiService.planReviewSession(input);
      const audit: ProviderAudit = {
        ...operation.metadata,
        latencyMs: Math.max(0, Date.now() - startedAt),
      };
      let result: ReviewSessionPlanResult;
      try {
        result = this.applyPlanPolicy(
          parseReviewSessionPlanResult(operation.result, input),
          input,
        );
      } catch {
        return null;
      }
      audit.confidence = result.confidence;
      if (result.confidence < this.config.reviewMinConfidence) {
        return null;
      }
      return this.planAiDecision(request.reviewSessionId, input, result, audit);
    } catch {
      return null;
    }
  }

  async diagnoseAnswer(
    request: AnswerDiagnosisDecisionRequest,
  ): Promise<PersistReviewAgentDecisionInput | null> {
    const input = this.sanitizeDiagnosisInput(request.input);
    validateDiagnoseReviewAnswerInput(input);

    if (!this.config.reviewAgentEnabled) return null;
    if (request.isCorrect || request.wasSkipped) return null;
    if (!this.isDiagnosisCallUseful(request, input)) {
      return null;
    }
    if (
      !(await this.agentRepository.reserveDiagnosisCall(
        request.userId,
        request.reviewSessionId,
        this.config.reviewMaxCallsPerSession,
        this.config.reviewMaxDiagnosisCalls,
      ))
    ) {
      return null;
    }

    const startedAt = Date.now();
    try {
      const operation = await this.aiService.diagnoseReviewAnswer(input);
      const audit: ProviderAudit = {
        ...operation.metadata,
        latencyMs: Math.max(0, Date.now() - startedAt),
      };
      let result: ReviewAnswerDiagnosisResult;
      try {
        result = this.applyDiagnosisPolicy(
          parseReviewAnswerDiagnosisResult(operation.result, input),
          input,
        );
      } catch {
        return null;
      }
      audit.confidence = result.confidence;
      if (result.confidence < this.config.reviewMinConfidence) {
        return null;
      }
      return this.diagnosisAiDecision(request, input, result, audit);
    } catch {
      return null;
    }
  }

  private reserveCall(userId: string, sessionId: string): Promise<boolean> {
    return this.agentRepository.reserveCall(
      userId,
      sessionId,
      this.config.reviewMaxCallsPerSession,
    );
  }

  private planAiDecision(
    reviewSessionId: string,
    input: PlanReviewSessionInput,
    result: ReviewSessionPlanResult,
    audit: ProviderAudit,
  ): PersistReviewAgentDecisionInput {
    return {
      reviewSessionId,
      reviewSessionItemId: null,
      reviewAnswerId: null,
      kind: ReviewDecisionKind.SESSION_PLAN,
      source: ReviewDecisionSource.AI,
      action: null,
      skillDimension: null,
      errorType: null,
      confidence: result.confidence,
      reasonCode: 'AI_PLAN_ACCEPTED',
      stateSnapshot: this.planSnapshot(input),
      decisionPayload: this.planPayload(result),
      provider: audit.provider,
      model: audit.model,
      promptVersion: audit.promptVersion,
      latencyMs: audit.latencyMs,
    };
  }

  private diagnosisAiDecision(
    request: AnswerDiagnosisDecisionRequest,
    input: DiagnoseReviewAnswerInput,
    result: ReviewAnswerDiagnosisResult,
    audit: ProviderAudit,
  ): PersistReviewAgentDecisionInput {
    return {
      reviewSessionId: request.reviewSessionId,
      reviewSessionItemId: request.reviewSessionItemId,
      reviewAnswerId: request.reviewAnswerId,
      kind: ReviewDecisionKind.ANSWER_INTERVENTION,
      source: ReviewDecisionSource.AI,
      action: result.action,
      skillDimension: result.skillDimension,
      errorType: result.errorType,
      confidence: result.confidence,
      reasonCode: result.reasonCode,
      stateSnapshot: this.diagnosisSnapshot(input),
      decisionPayload: this.diagnosisPayload(result),
      provider: audit.provider,
      model: audit.model,
      promptVersion: audit.promptVersion,
      latencyMs: audit.latencyMs,
    };
  }

  private applyPlanPolicy(
    result: ReviewSessionPlanResult,
    input: PlanReviewSessionInput,
  ): ReviewSessionPlanResult {
    return {
      ...result,
      focusDimensions: result.focusDimensions
        .filter((dimension) => input.allowedFocusDimensions.includes(dimension))
        .slice(0, 3),
      orderedCandidateAliases: result.orderedCandidateAliases.slice(
        0,
        input.maxItemCount,
      ),
    };
  }

  private applyDiagnosisPolicy(
    result: ReviewAnswerDiagnosisResult,
    input: DiagnoseReviewAnswerInput,
  ): ReviewAnswerDiagnosisResult {
    if (
      input.attemptNumber >= 2 &&
      (result.action === ReviewAgentAction.REQUEUE_WITH_NEW_TYPE ||
        result.action === ReviewAgentAction.TEACH_AND_REQUEUE)
    ) {
      return {
        action: input.allowedActions.includes(
          ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS,
        )
          ? ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS
          : ReviewAgentAction.CONTINUE,
        skillDimension: result.skillDimension,
        errorType: result.errorType,
        confidence: result.confidence,
        reasonCode: 'SECOND_ATTEMPT_NO_REQUEUE',
        microLesson: null,
        retest: null,
      };
    }
    if (!result.retest) return result;
    return {
      ...result,
      retest: {
        ...result.retest,
        afterItems: this.clampRetestOffset(result.retest.afterItems),
      },
    };
  }

  private clampRetestOffset(value: number): 2 | 3 | 4 | 5 {
    if (value <= 2) return 2;
    if (value >= 5) return 5;
    return value <= 3 ? 3 : 4;
  }

  private isDiagnosisCallUseful(
    request: AnswerDiagnosisDecisionRequest,
    input: DiagnoseReviewAnswerInput,
  ): boolean {
    return (
      request.lapseCount > 0 ||
      input.questionType === QuestionType.FILL_BLANK ||
      input.questionType === QuestionType.SELECT_CORRECT_CONTEXT ||
      input.recentAttempts.some(({ isCorrect }) => !isCorrect)
    );
  }

  private sanitizePlanInput(
    input: PlanReviewSessionInput,
  ): PlanReviewSessionInput {
    return {
      targetCefr: input.targetCefr,
      reviewGoal: input.reviewGoal,
      targetDurationMinutes: input.targetDurationMinutes,
      maxItemCount: input.maxItemCount,
      allowedFocusDimensions: [...input.allowedFocusDimensions],
      candidates: input.candidates.map((candidate) => ({
        alias: candidate.alias,
        wordOrPhrase: candidate.wordOrPhrase,
        lemma: candidate.lemma,
        partOfSpeech: candidate.partOfSpeech,
        contextualMeaningVi: candidate.contextualMeaningVi,
        originalSentence: candidate.originalSentence,
        daysOverdue: candidate.daysOverdue,
        lapseCount: candidate.lapseCount,
        recentAttempts: candidate.recentAttempts.map((attempt) => ({
          questionType: attempt.questionType,
          skillDimension: attempt.skillDimension,
          isCorrect: attempt.isCorrect,
          responseTimeMs: attempt.responseTimeMs,
          hintsUsed: attempt.hintsUsed,
        })),
      })),
      skillAggregates: input.skillAggregates.map((aggregate) => ({
        skillDimension: aggregate.skillDimension,
        attempts: aggregate.attempts,
        correct: aggregate.correct,
        averageResponseTimeMs: aggregate.averageResponseTimeMs,
      })),
    };
  }

  private sanitizeDiagnosisInput(
    input: DiagnoseReviewAnswerInput,
  ): DiagnoseReviewAnswerInput {
    return {
      targetCefr: input.targetCefr,
      wordOrPhrase: input.wordOrPhrase,
      lemma: input.lemma,
      partOfSpeech: input.partOfSpeech,
      contextualMeaningVi: input.contextualMeaningVi,
      originalSentence: input.originalSentence,
      questionType: input.questionType,
      learnerAnswer: input.learnerAnswer,
      correctAnswer: input.correctAnswer,
      responseTimeMs: input.responseTimeMs,
      hintsUsed: input.hintsUsed,
      attemptNumber: input.attemptNumber,
      recentAttempts: input.recentAttempts.map((attempt) => ({
        questionType: attempt.questionType,
        skillDimension: attempt.skillDimension,
        isCorrect: attempt.isCorrect,
        responseTimeMs: attempt.responseTimeMs,
        hintsUsed: attempt.hintsUsed,
      })),
      skillAggregates: input.skillAggregates.map((aggregate) => ({
        skillDimension: aggregate.skillDimension,
        attempts: aggregate.attempts,
        correct: aggregate.correct,
        averageResponseTimeMs: aggregate.averageResponseTimeMs,
      })),
      allowedSkillDimensions: [...input.allowedSkillDimensions],
      allowedActions: [...input.allowedActions],
      allowedRetestQuestionTypes: [...input.allowedRetestQuestionTypes],
      allowedRetestAfterItems: [...input.allowedRetestAfterItems],
    };
  }

  private planSnapshot(input: PlanReviewSessionInput): ReviewAgentJsonObject {
    return this.toJsonObject(input);
  }

  private diagnosisSnapshot(
    input: DiagnoseReviewAnswerInput,
  ): ReviewAgentJsonObject {
    return this.toJsonObject(input);
  }

  private planPayload(result: ReviewSessionPlanResult): ReviewAgentJsonObject {
    return this.toJsonObject(result);
  }

  private diagnosisPayload(
    result: ReviewAnswerDiagnosisResult,
  ): ReviewAgentJsonObject {
    return this.toJsonObject(result);
  }

  private toJsonObject(value: object): ReviewAgentJsonObject {
    const result: ReviewAgentJsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = this.toJsonValue(item);
    }
    return result;
  }

  private toJsonValue(value: unknown): ReviewAgentJsonValue {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.toJsonValue(item));
    }
    if (typeof value === 'object') return this.toJsonObject(value);
    throw new TypeError('Review agent audit data must be JSON-compatible');
  }
}
