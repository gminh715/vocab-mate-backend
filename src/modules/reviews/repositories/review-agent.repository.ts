import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  ReviewQuestionGenerationSource,
  QuestionType,
  ReviewAgentAction,
  ReviewDecisionKind,
  type ReviewDecisionSource,
  type ReviewErrorType,
  type ReviewGoal,
  ReviewSessionItemStatus,
  ReviewSessionStatus,
  type ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import {
  REVIEW_QUESTION_PROMPT_VERSION,
  type ReviewRetestAfterItems,
  type ReviewTargetDuration,
} from '../../ai/ai.contracts';
import { PrismaService } from '../../../database/prisma.service';
import type { PreparedAiReviewQuestion } from './review-questions.repository';
import {
  ReviewConcurrencyConflictError,
  ReviewResourceNotFoundError,
} from './review-errors';

export class InvalidReviewAgentDecisionRelationshipError extends Error {}
export class ReviewAgentDecisionConflictError extends Error {}

export type ReviewAgentJsonValue =
  | string
  | number
  | boolean
  | null
  | ReviewAgentJsonValue[]
  | ReviewAgentJsonObject;

export interface ReviewAgentJsonObject {
  [key: string]: ReviewAgentJsonValue;
}

export interface PersistReviewAgentDecisionInput {
  reviewSessionId: string;
  reviewSessionItemId: string | null;
  reviewAnswerId: string | null;
  kind: ReviewDecisionKind;
  source: ReviewDecisionSource;
  action: ReviewAgentAction | null;
  skillDimension: ReviewSkillDimension | null;
  errorType: ReviewErrorType | null;
  confidence: number | null;
  reasonCode: string;
  stateSnapshot: ReviewAgentJsonObject;
  decisionPayload: ReviewAgentJsonObject;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  latencyMs: number | null;
}

export interface ApplyAnswerAgentDecisionInput {
  decision: PersistReviewAgentDecisionInput;
  originalQuestionType: QuestionType;
  expectedAttemptNumber: number;
  preparedRetestQuestion: PreparedAiReviewQuestion | null;
}

export interface ApplySessionPlanDecisionInput {
  decision: PersistReviewAgentDecisionInput;
  targetDurationMinutes: ReviewTargetDuration;
  reviewGoal: ReviewGoal;
  plannedItemCount: number;
  planSummary: string;
  agentVersion: string;
  orderedSessionItemIds: string[];
}

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_LEARNER_SNAPSHOT_VOCABULARIES = 100;
const sessionSelect = {
  id: true,
  targetDurationMinutes: true,
  reviewGoal: true,
  plannedItemCount: true,
  planSummary: true,
  status: true,
  startedAt: true,
  completedAt: true,
} as const;
const safeQuestionSelect = {
  id: true,
  questionType: true,
  prompt: true,
  blankSentence: true,
  correctAnswerText: true,
  points: true,
  displayOrder: true,
  options: {
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, optionText: true, displayOrder: true },
  },
} satisfies Prisma.ReviewQuestionSelect;
const answerWordCharacters = (answer: string | null | undefined): string[][] =>
  answer
    ?.trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => Array.from(word)) ?? [];

/** Persistence boundary for AI budgets and auditable review-agent decisions. */
@Injectable()
export class ReviewAgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async reserveCall(
    userId: string,
    sessionId: string,
    maximumCalls: number,
  ): Promise<boolean> {
    this.assertAiCallMaximum(maximumCalls, 'maximumCalls');
    const reservation = await this.prisma.reviewSession.updateMany({
      where: {
        id: sessionId,
        userId,
        status: ReviewSessionStatus.IN_PROGRESS,
        aiCallCount: { lt: maximumCalls },
      },
      data: { aiCallCount: { increment: 1 } },
    });
    return reservation.count === 1;
  }

  async reserveDiagnosisCall(
    userId: string,
    sessionId: string,
    maximumCalls: number,
    maximumDiagnosisCalls: number,
  ): Promise<boolean> {
    this.assertAiCallMaximum(maximumCalls, 'maximumCalls');
    this.assertAiCallMaximum(maximumDiagnosisCalls, 'maximumDiagnosisCalls');
    const reservation = await this.prisma.reviewSession.updateMany({
      where: {
        id: sessionId,
        userId,
        status: ReviewSessionStatus.IN_PROGRESS,
        aiCallCount: { lt: maximumCalls },
        aiDiagnosisCallCount: { lt: maximumDiagnosisCalls },
      },
      data: {
        aiCallCount: { increment: 1 },
        aiDiagnosisCallCount: { increment: 1 },
      },
    });
    return reservation.count === 1;
  }

  async persist(userId: string, input: PersistReviewAgentDecisionInput) {
    const isAnswerDecision =
      input.kind === ReviewDecisionKind.ANSWER_INTERVENTION;
    if (
      (isAnswerDecision &&
        (!input.reviewSessionItemId || !input.reviewAnswerId)) ||
      (!isAnswerDecision &&
        (input.reviewSessionItemId !== null || input.reviewAnswerId !== null))
    ) {
      throw new InvalidReviewAgentDecisionRelationshipError();
    }
    try {
      const decision = await this.prisma.$transaction(async (tx) => {
        const session = await tx.reviewSession.findFirst({
          where: { id: input.reviewSessionId, userId },
          select: { id: true },
        });
        if (!session) throw new ReviewResourceNotFoundError();
        if (input.reviewSessionItemId) {
          const item = await tx.reviewSessionItem.findFirst({
            where: {
              id: input.reviewSessionItemId,
              reviewSessionId: input.reviewSessionId,
            },
            select: { id: true },
          });
          if (!item) throw new InvalidReviewAgentDecisionRelationshipError();
        }
        if (input.reviewAnswerId) {
          const answer = await tx.reviewAnswer.findFirst({
            where: {
              id: input.reviewAnswerId,
              reviewSessionItem: {
                is: {
                  reviewSessionId: input.reviewSessionId,
                  ...(input.reviewSessionItemId
                    ? { id: input.reviewSessionItemId }
                    : {}),
                },
              },
            },
            select: { id: true },
          });
          if (!answer) throw new InvalidReviewAgentDecisionRelationshipError();
        }
        return tx.reviewAgentDecision.create({ data: input });
      });
      return { decision, created: true } as const;
    } catch (error: unknown) {
      if (!input.reviewAnswerId || !this.hasPrismaCode(error, 'P2002')) {
        throw error;
      }
      const existing = await this.prisma.reviewAgentDecision.findFirst({
        where: {
          reviewAnswerId: input.reviewAnswerId,
          kind: input.kind,
          reviewSession: { is: { userId } },
        },
      });
      if (!existing) throw error;
      return { decision: existing, created: false } as const;
    }
  }

  async applySessionPlan(userId: string, input: ApplySessionPlanDecisionInput) {
    const { decision } = input;
    const uniqueItemIds = new Set(input.orderedSessionItemIds);
    if (
      decision.kind !== ReviewDecisionKind.SESSION_PLAN ||
      decision.reviewSessionItemId !== null ||
      decision.reviewAnswerId !== null ||
      decision.action !== null ||
      decision.skillDimension !== null ||
      decision.errorType !== null ||
      ![5, 10, 15].includes(input.targetDurationMinutes) ||
      input.plannedItemCount !== input.orderedSessionItemIds.length ||
      input.plannedItemCount < 1 ||
      input.plannedItemCount > MAX_LEARNER_SNAPSHOT_VOCABULARIES ||
      uniqueItemIds.size !== input.orderedSessionItemIds.length ||
      input.planSummary.trim().length === 0 ||
      input.planSummary.length > 300 ||
      input.agentVersion.trim().length === 0 ||
      input.agentVersion.length > 50
    ) {
      throw new InvalidReviewAgentDecisionRelationshipError();
    }
    return this.withSerializableRetry(async (tx) => {
      const session = await tx.reviewSession.findFirst({
        where: {
          id: decision.reviewSessionId,
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
          planSummary: null,
        },
        select: sessionSelect,
      });
      if (!session) throw new ReviewAgentDecisionConflictError();
      const items = await tx.reviewSessionItem.findMany({
        where: {
          reviewSessionId: session.id,
          status: ReviewSessionItemStatus.PENDING,
        },
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
        select: { id: true, sequenceNumber: true },
      });
      if (
        items.length !== input.orderedSessionItemIds.length ||
        items.some(({ id }) => !uniqueItemIds.has(id))
      ) {
        throw new ReviewAgentDecisionConflictError();
      }
      const claimed = await tx.reviewSession.updateMany({
        where: {
          id: session.id,
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
          planSummary: null,
        },
        data: {
          targetDurationMinutes: input.targetDurationMinutes,
          reviewGoal: input.reviewGoal,
          plannedItemCount: input.plannedItemCount,
          planSummary: input.planSummary.trim(),
          agentVersion: input.agentVersion,
        },
      });
      if (claimed.count !== 1) throw new ReviewAgentDecisionConflictError();
      const orderChanged = input.orderedSessionItemIds.some(
        (itemId, index) => items[index]?.id !== itemId,
      );
      if (orderChanged) {
        const sequenceOffset = items.length + 1;
        await tx.reviewSessionItem.updateMany({
          where: { reviewSessionId: session.id },
          data: { sequenceNumber: { increment: sequenceOffset } },
        });
        for (const [index, itemId] of input.orderedSessionItemIds.entries()) {
          await tx.reviewSessionItem.update({
            where: { id: itemId },
            data: { sequenceNumber: index + 1 },
            select: { id: true },
          });
        }
      }
      await tx.reviewAgentDecision.create({ data: decision });
      const plannedSession = await tx.reviewSession.findFirst({
        where: { id: session.id, userId },
        select: sessionSelect,
      });
      if (!plannedSession) throw new ReviewAgentDecisionConflictError();
      return this.getSessionState(tx, plannedSession);
    });
  }

  async applyAnswerDecision(
    userId: string,
    input: ApplyAnswerAgentDecisionInput,
  ) {
    const { decision } = input;
    const retest = this.readRetestDecision(decision.decisionPayload);
    const hasRetestAction =
      decision.action === ReviewAgentAction.REQUEUE_WITH_NEW_TYPE ||
      decision.action === ReviewAgentAction.TEACH_AND_REQUEUE;
    if (
      decision.kind !== ReviewDecisionKind.ANSWER_INTERVENTION ||
      !decision.reviewSessionItemId ||
      !decision.reviewAnswerId ||
      !decision.action ||
      !decision.skillDimension ||
      !decision.errorType ||
      this.readAgentAction(decision.decisionPayload) !== decision.action ||
      (hasRetestAction
        ? !retest || retest.questionType === input.originalQuestionType
        : retest !== null || input.preparedRetestQuestion !== null)
    ) {
      throw new InvalidReviewAgentDecisionRelationshipError();
    }
    const reviewSessionItemId = decision.reviewSessionItemId;
    const reviewAnswerId = decision.reviewAnswerId;
    try {
      return await this.withSerializableRetry(async (tx) => {
        const session = await tx.reviewSession.findFirst({
          where: {
            id: decision.reviewSessionId,
            userId,
            status: ReviewSessionStatus.IN_PROGRESS,
          },
          select: sessionSelect,
        });
        if (!session) throw new ReviewAgentDecisionConflictError();
        const item = await tx.reviewSessionItem.findFirst({
          where: {
            id: reviewSessionItemId,
            reviewSessionId: session.id,
            status: ReviewSessionItemStatus.PENDING,
          },
          select: {
            id: true,
            userVocabularyId: true,
            retryCount: true,
            reviewQuestion: {
              select: {
                id: true,
                articleSentenceTermId: true,
                questionType: true,
              },
            },
            userVocabulary: { select: { savedCefrLevel: true } },
          },
        });
        if (
          !item ||
          !item.userVocabularyId ||
          !item.userVocabulary ||
          item.retryCount !== input.expectedAttemptNumber
        ) {
          throw new ReviewAgentDecisionConflictError();
        }
        const answer = await tx.reviewAnswer.findFirst({
          where: {
            id: reviewAnswerId,
            reviewSessionItemId: item.id,
            attemptNumber: input.expectedAttemptNumber,
            isCorrect: false,
            reviewQuestion: {
              is: { questionType: input.originalQuestionType },
            },
          },
          select: { id: true },
        });
        if (!answer) throw new ReviewAgentDecisionConflictError();
        let retestQuestionId: string | null = retest
          ? item.reviewQuestion.id
          : null;
        if (
          retest &&
          item.reviewQuestion.questionType !== retest.questionType
        ) {
          const prepared = input.preparedRetestQuestion;
          if (
            !prepared ||
            prepared.userVocabularyId !== item.userVocabularyId ||
            prepared.articleSentenceTermId !==
              item.reviewQuestion.articleSentenceTermId ||
            prepared.difficultyCefr !== item.userVocabulary.savedCefrLevel ||
            prepared.questionType !== retest.questionType
          ) {
            throw new ReviewAgentDecisionConflictError();
          }
          const preparedQuestion = await tx.reviewQuestion.findFirst({
            where: {
              id: prepared.reviewQuestionId,
              articleSentenceTermId: prepared.articleSentenceTermId,
              difficultyCefr: prepared.difficultyCefr,
              questionType: retest.questionType,
              generationSource: ReviewQuestionGenerationSource.AI,
              generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
              isActive: true,
            },
            select: { id: true },
          });
          if (!preparedQuestion) throw new ReviewAgentDecisionConflictError();
          retestQuestionId = preparedQuestion.id;
        }
        await tx.reviewAgentDecision.create({ data: decision });
        await tx.reviewAnswer.update({
          where: { id: answer.id },
          data: {
            skillDimension: decision.skillDimension,
            errorType: decision.errorType,
          },
          select: { id: true },
        });
        if (retestQuestionId && retestQuestionId !== item.reviewQuestion.id) {
          await tx.reviewSessionItem.update({
            where: { id: item.id },
            data: { reviewQuestionId: retestQuestionId },
            select: { id: true },
          });
        }
        if (retest) {
          await this.movePendingItemAfter(
            tx,
            session.id,
            item.id,
            retest.afterItems,
          );
        }
        const state = await this.getSessionState(tx, session);
        return { ...state, agentFeedback: this.toAgentFeedback(decision) };
      });
    } catch (error: unknown) {
      if (this.hasPrismaCode(error, 'P2002')) {
        throw new ReviewAgentDecisionConflictError();
      }
      throw error;
    }
  }

  private async movePendingItemAfter(
    tx: Prisma.TransactionClient,
    sessionId: string,
    itemId: string,
    afterItems: ReviewRetestAfterItems,
  ): Promise<void> {
    const pending = await tx.reviewSessionItem.findMany({
      where: {
        reviewSessionId: sessionId,
        status: ReviewSessionItemStatus.PENDING,
      },
      orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
      select: { id: true, sequenceNumber: true },
    });
    const currentIndex = pending.findIndex(({ id }) => id === itemId);
    const otherItems = pending.filter(({ id }) => id !== itemId);
    if (currentIndex < 0 || otherItems.length < afterItems) {
      throw new ReviewAgentDecisionConflictError();
    }
    const reordered = [...otherItems];
    const current = pending[currentIndex];
    reordered.splice(afterItems, 0, current);
    if (reordered.every((item, index) => item.id === pending[index]?.id))
      return;
    const sequenceNumbers = pending.map(({ sequenceNumber }) => sequenceNumber);
    await tx.reviewSessionItem.update({
      where: { id: itemId },
      data: { sequenceNumber: 0 },
      select: { id: true },
    });
    if (currentIndex > afterItems) {
      for (let index = currentIndex - 1; index >= afterItems; index -= 1) {
        await tx.reviewSessionItem.update({
          where: { id: pending[index].id },
          data: { sequenceNumber: sequenceNumbers[index + 1] },
          select: { id: true },
        });
      }
    } else {
      for (let index = currentIndex + 1; index <= afterItems; index += 1) {
        await tx.reviewSessionItem.update({
          where: { id: pending[index].id },
          data: { sequenceNumber: sequenceNumbers[index - 1] },
          select: { id: true },
        });
      }
    }
    await tx.reviewSessionItem.update({
      where: { id: itemId },
      data: { sequenceNumber: sequenceNumbers[afterItems] },
      select: { id: true },
    });
  }

  private readRetestDecision(payload: unknown): {
    questionType: QuestionType;
    afterItems: ReviewRetestAfterItems;
  } | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    )
      return null;
    const retest = 'retest' in payload ? payload.retest : null;
    if (typeof retest !== 'object' || retest === null || Array.isArray(retest))
      return null;
    const questionType =
      'questionType' in retest ? retest.questionType : undefined;
    const afterItems = 'afterItems' in retest ? retest.afterItems : undefined;
    if (!this.isQuestionType(questionType) || !this.isRetestOffset(afterItems))
      return null;
    return { questionType, afterItems };
  }

  private readAgentAction(payload: unknown): ReviewAgentAction | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      !('action' in payload)
    )
      return null;
    return (
      Object.values(ReviewAgentAction).find(
        (candidate) => candidate === payload.action,
      ) ?? null
    );
  }

  private isQuestionType(value: unknown): value is QuestionType {
    return (
      typeof value === 'string' &&
      Object.values(QuestionType).some((candidate) => candidate === value)
    );
  }

  private isRetestOffset(value: unknown): value is ReviewRetestAfterItems {
    return value === 2 || value === 3 || value === 4 || value === 5;
  }

  private toAgentFeedback(decision: {
    source: ReviewDecisionSource;
    action: ReviewAgentAction | null;
    skillDimension: ReviewSkillDimension | null;
    errorType: ReviewErrorType | null;
    decisionPayload: unknown;
  }) {
    const retest = this.readRetestDecision(decision.decisionPayload);
    const payload =
      typeof decision.decisionPayload === 'object' &&
      decision.decisionPayload !== null &&
      !Array.isArray(decision.decisionPayload)
        ? decision.decisionPayload
        : null;
    const lesson =
      payload && 'microLesson' in payload ? payload.microLesson : null;
    const microLesson =
      typeof lesson === 'object' && lesson !== null && !Array.isArray(lesson)
        ? {
            title: String('title' in lesson ? lesson.title : ''),
            explanation: String(
              'explanation' in lesson ? lesson.explanation : '',
            ),
            example: String('example' in lesson ? lesson.example : ''),
          }
        : null;
    return {
      source: decision.source,
      action: decision.action,
      skillDimension: decision.skillDimension,
      errorType: decision.errorType,
      ...(microLesson ? { microLesson } : {}),
      ...(retest ? { retestAfterItems: retest.afterItems } : {}),
    };
  }

  private async getSessionState(
    client: Prisma.TransactionClient,
    session: {
      id: string;
      targetDurationMinutes: number | null;
      reviewGoal: ReviewGoal | null;
      plannedItemCount: number | null;
      planSummary: string | null;
      status: ReviewSessionStatus;
      startedAt: Date;
      completedAt: Date | null;
    },
  ) {
    const [totalQuestions, answeredCount, next] = await Promise.all([
      client.reviewSessionItem.count({
        where: { reviewSessionId: session.id },
      }),
      client.reviewSessionItem.count({
        where: {
          reviewSessionId: session.id,
          status: {
            in: [
              ReviewSessionItemStatus.COMPLETED,
              ReviewSessionItemStatus.SKIPPED,
            ],
          },
        },
      }),
      session.status === ReviewSessionStatus.IN_PROGRESS
        ? client.reviewSessionItem.findFirst({
            where: {
              reviewSessionId: session.id,
              status: ReviewSessionItemStatus.PENDING,
            },
            orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              userVocabularyId: true,
              retryCount: true,
              reviewQuestion: { select: safeQuestionSelect },
            },
          })
        : Promise.resolve(null),
    ]);
    return {
      session,
      answeredCount,
      totalQuestions,
      nextItem: next?.userVocabularyId
        ? {
            id: next.id,
            userVocabularyId: next.userVocabularyId,
            attemptNumber: next.retryCount + 1,
            question: this.mapSafeQuestion(next.reviewQuestion),
          }
        : undefined,
    };
  }

  private mapSafeQuestion(question: {
    id: string;
    questionType: QuestionType;
    prompt: string;
    blankSentence: string | null;
    correctAnswerText: string | null;
    points: number;
    displayOrder: number;
    options: Array<{ id: string; optionText: string; displayOrder: number }>;
  }) {
    return {
      id: question.id,
      questionType: question.questionType,
      prompt: question.prompt,
      blankSentence: question.blankSentence,
      answerWordLengths:
        question.questionType === QuestionType.FILL_BLANK
          ? answerWordCharacters(question.correctAnswerText).map(
              (word) => word.length,
            )
          : null,
      points: question.points,
      displayOrder: question.displayOrder,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.optionText,
        displayOrder: option.displayOrder,
      })),
    };
  }

  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!this.hasPrismaCode(error, 'P2034')) throw error;
        if (attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw new ReviewConcurrencyConflictError();
        }
      }
    }
    throw new ReviewConcurrencyConflictError();
  }

  private hasPrismaCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }

  private assertAiCallMaximum(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 1 || value > 32_767) {
      throw new RangeError(`${name} must be a positive SmallInt`);
    }
  }
}
