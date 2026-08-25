import { Inject, Injectable } from '@nestjs/common';
import type { AiConfig } from '../../../config/ai.config';
import { AI_CONFIG } from '../../../config/config.module';
import type {
  DiagnoseReviewAnswerInput,
  PlanReviewSessionInput,
  ReviewAnswerDiagnosisResult,
  ReviewQuestionType,
  ReviewSessionPlanResult,
  ReviewSkillDimension as AiReviewSkillDimension,
} from '../../ai/ai.contracts';
import { AiService } from '../../ai/ai.service';
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
  ReviewErrorType,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import {
  type PersistReviewAgentDecisionInput,
  type ReviewAgentJsonObject,
  type ReviewAgentJsonValue,
} from '../repositories/review-sessions.repository';
import { ReviewAgentRepository } from '../repositories/review-agent.repository';

const RULE_PROMPT_VERSION = 'review-agent-rule-v1';
const DEFAULT_RETEST_AFTER_ITEMS = 3;

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

  async planSession(
    request: SessionPlanDecisionRequest,
  ): Promise<PersistReviewAgentDecisionInput> {
    const input = this.sanitizePlanInput(request.input);
    validatePlanReviewSessionInput(input);
    const fallback = (reasonCode: string, audit?: ProviderAudit) =>
      this.planFallback(request.reviewSessionId, input, reasonCode, audit);

    if (!this.config.reviewAgentEnabled) return fallback('AGENT_DISABLED');
    if (input.candidates.length < 2) return fallback('CALL_NOT_USEFUL');
    if (!(await this.reserveCall(request.userId, request.reviewSessionId))) {
      return fallback('BUDGET_EXHAUSTED');
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
        return fallback('INVALID_AI_DECISION', audit);
      }
      audit.confidence = result.confidence;
      if (result.confidence < this.config.reviewMinConfidence) {
        return fallback('LOW_CONFIDENCE', audit);
      }
      return this.planAiDecision(request.reviewSessionId, input, result, audit);
    } catch {
      return fallback('AI_UNAVAILABLE', {
        provider: null,
        model: null,
        promptVersion: this.config.reviewPromptVersion,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
    }
  }

  planSessionDeterministically(
    request: SessionPlanDecisionRequest,
  ): PersistReviewAgentDecisionInput {
    const input = this.sanitizePlanInput(request.input);
    validatePlanReviewSessionInput(input);
    return this.planFallback(
      request.reviewSessionId,
      input,
      'DETERMINISTIC_PLAN',
    );
  }

  async diagnoseAnswer(
    request: AnswerDiagnosisDecisionRequest,
  ): Promise<PersistReviewAgentDecisionInput> {
    const input = this.sanitizeDiagnosisInput(request.input);
    validateDiagnoseReviewAnswerInput(input);
    const fallback = (
      reasonCode: string,
      audit?: ProviderAudit,
      errorType: ReviewErrorType = ReviewErrorType.UNKNOWN,
    ) => this.diagnosisFallback(request, input, reasonCode, errorType, audit);

    if (!this.config.reviewAgentEnabled) return fallback('AGENT_DISABLED');
    if (request.isCorrect) return fallback('CORRECT_ANSWER');
    if (request.wasSkipped) return fallback('SKIPPED_ITEM');
    if (this.isObviousSpellingError(input)) {
      return fallback(
        'OBVIOUS_SPELLING_ERROR',
        undefined,
        ReviewErrorType.SPELLING_ERROR,
      );
    }
    if (!this.isDiagnosisCallUseful(request, input)) {
      return fallback('CALL_NOT_USEFUL');
    }
    if (
      !(await this.agentRepository.reserveDiagnosisCall(
        request.userId,
        request.reviewSessionId,
        this.config.reviewMaxCallsPerSession,
        this.config.reviewMaxDiagnosisCalls,
      ))
    ) {
      return fallback('BUDGET_EXHAUSTED');
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
        return fallback('INVALID_AI_DECISION', audit);
      }
      audit.confidence = result.confidence;
      if (result.confidence < this.config.reviewMinConfidence) {
        return fallback('LOW_CONFIDENCE', audit);
      }
      return this.diagnosisAiDecision(request, input, result, audit);
    } catch {
      return fallback('AI_UNAVAILABLE', {
        provider: null,
        model: null,
        promptVersion: this.config.reviewPromptVersion,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
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

  private planFallback(
    reviewSessionId: string,
    input: PlanReviewSessionInput,
    reasonCode: string,
    audit?: ProviderAudit,
  ): PersistReviewAgentDecisionInput {
    const result = this.deterministicPlan(input);
    return {
      reviewSessionId,
      reviewSessionItemId: null,
      reviewAnswerId: null,
      kind: ReviewDecisionKind.SESSION_PLAN,
      source: ReviewDecisionSource.RULE,
      action: null,
      skillDimension: null,
      errorType: null,
      confidence: audit?.confidence ?? null,
      reasonCode,
      stateSnapshot: this.planSnapshot(input),
      decisionPayload: this.planPayload(result),
      provider: audit?.provider ?? null,
      model: audit?.model ?? null,
      promptVersion: audit?.promptVersion ?? RULE_PROMPT_VERSION,
      latencyMs: audit?.latencyMs ?? null,
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

  private diagnosisFallback(
    request: AnswerDiagnosisDecisionRequest,
    input: DiagnoseReviewAnswerInput,
    reasonCode: string,
    errorType: ReviewErrorType,
    audit?: ProviderAudit,
  ): PersistReviewAgentDecisionInput {
    const result = this.deterministicDiagnosis(request, input, errorType);
    return {
      reviewSessionId: request.reviewSessionId,
      reviewSessionItemId: request.reviewSessionItemId,
      reviewAnswerId: request.reviewAnswerId,
      kind: ReviewDecisionKind.ANSWER_INTERVENTION,
      source: ReviewDecisionSource.RULE,
      action: result.action,
      skillDimension: result.skillDimension,
      errorType: result.errorType,
      confidence: audit?.confidence ?? null,
      reasonCode,
      stateSnapshot: this.diagnosisSnapshot(input),
      decisionPayload: this.diagnosisPayload(result),
      provider: audit?.provider ?? null,
      model: audit?.model ?? null,
      promptVersion: audit?.promptVersion ?? RULE_PROMPT_VERSION,
      latencyMs: audit?.latencyMs ?? null,
    };
  }

  private deterministicPlan(
    input: PlanReviewSessionInput,
  ): ReviewSessionPlanResult {
    const preferredSkill =
      input.reviewGoal === 'RECALL'
        ? 'RECALL'
        : input.reviewGoal === 'SPELLING'
          ? 'SPELLING'
          : input.reviewGoal === 'CONTEXT'
            ? 'CONTEXT'
            : input.allowedFocusDimensions[0];
    const focusDimensions = input.allowedFocusDimensions.includes(
      preferredSkill,
    )
      ? [preferredSkill]
      : [input.allowedFocusDimensions[0]];
    const orderedCandidateAliases = [...input.candidates]
      .sort((left, right) => {
        const leftGoalErrors = this.goalErrorCount(left, preferredSkill);
        const rightGoalErrors = this.goalErrorCount(right, preferredSkill);
        const leftErrors = left.recentAttempts.filter(
          ({ isCorrect }) => !isCorrect,
        ).length;
        const rightErrors = right.recentAttempts.filter(
          ({ isCorrect }) => !isCorrect,
        ).length;
        return (
          rightGoalErrors - leftGoalErrors ||
          rightErrors - leftErrors ||
          right.lapseCount - left.lapseCount ||
          right.daysOverdue - left.daysOverdue ||
          left.alias.localeCompare(right.alias)
        );
      })
      .slice(0, input.maxItemCount)
      .map(({ alias }) => alias);
    return {
      reviewGoal: input.reviewGoal,
      focusDimensions,
      orderedCandidateAliases,
      summary: `Review ${orderedCandidateAliases.length} vocabulary item${orderedCandidateAliases.length === 1 ? '' : 's'} with a ${input.reviewGoal.toLowerCase()} focus.`,
      confidence: 0,
    };
  }

  private goalErrorCount(
    candidate: PlanReviewSessionInput['candidates'][number],
    preferredSkill: AiReviewSkillDimension,
  ): number {
    return candidate.recentAttempts.filter(
      ({ isCorrect, skillDimension }) =>
        !isCorrect && skillDimension === preferredSkill,
    ).length;
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

  private deterministicDiagnosis(
    request: AnswerDiagnosisDecisionRequest,
    input: DiagnoseReviewAnswerInput,
    errorType: ReviewErrorType,
  ): ReviewAnswerDiagnosisResult {
    const skillDimension = this.skillForQuestion(
      input.questionType,
      input.allowedSkillDimensions,
    );
    if (request.isCorrect || request.wasSkipped) {
      return {
        action: ReviewAgentAction.CONTINUE,
        skillDimension,
        errorType,
        confidence: 0,
        reasonCode: 'DETERMINISTIC_CONTINUE',
        microLesson: null,
        retest: null,
      };
    }

    const retestType = input.allowedRetestQuestionTypes.find(
      (questionType) => questionType !== input.questionType,
    );
    const canRequeue = input.allowedActions.includes(
      ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
    );
    if (canRequeue && retestType) {
      const afterItems = input.allowedRetestAfterItems.includes(
        DEFAULT_RETEST_AFTER_ITEMS,
      )
        ? DEFAULT_RETEST_AFTER_ITEMS
        : input.allowedRetestAfterItems[0];
      return {
        action: ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
        skillDimension,
        errorType,
        confidence: 0,
        reasonCode: 'DETERMINISTIC_REQUEUE',
        microLesson: null,
        retest: { questionType: retestType, afterItems },
      };
    }

    return {
      action: input.allowedActions.includes(
        ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS,
      )
        ? ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS
        : ReviewAgentAction.CONTINUE,
      skillDimension,
      errorType,
      confidence: 0,
      reasonCode: 'DETERMINISTIC_FOCUS',
      microLesson: null,
      retest: null,
    };
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

  private isObviousSpellingError(input: DiagnoseReviewAnswerInput): boolean {
    if (input.questionType !== QuestionType.FILL_BLANK) return false;
    const learner = input.learnerAnswer.trim().toLocaleLowerCase('en');
    const correct = input.correctAnswer.trim().toLocaleLowerCase('en');
    return (
      learner.length >= 4 &&
      correct.length >= 4 &&
      this.editDistanceAtMostOne(learner, correct)
    );
  }

  private editDistanceAtMostOne(left: string, right: string): boolean {
    if (left === right || Math.abs(left.length - right.length) > 1) {
      return left === right;
    }
    let leftIndex = 0;
    let rightIndex = 0;
    let edits = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
      if (left[leftIndex] === right[rightIndex]) {
        leftIndex += 1;
        rightIndex += 1;
        continue;
      }
      edits += 1;
      if (edits > 1) return false;
      if (left.length > right.length) leftIndex += 1;
      else if (right.length > left.length) rightIndex += 1;
      else {
        leftIndex += 1;
        rightIndex += 1;
      }
    }
    return (
      edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1
    );
  }

  private skillForQuestion(
    questionType: ReviewQuestionType,
    allowed: AiReviewSkillDimension[],
  ): AiReviewSkillDimension {
    const mapped =
      questionType === QuestionType.SELECT_MEANING
        ? ReviewSkillDimension.RECOGNITION
        : questionType === QuestionType.SELECT_WORD
          ? ReviewSkillDimension.RECALL
          : questionType === QuestionType.SELECT_CORRECT_CONTEXT
            ? ReviewSkillDimension.CONTEXT
            : ReviewSkillDimension.SPELLING;
    return allowed.includes(mapped) ? mapped : allowed[0];
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
