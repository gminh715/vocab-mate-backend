import { Injectable } from '@nestjs/common';
import {
  QuestionType,
  ReviewAgentAction,
  ReviewSessionItemStatus,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import type { ReviewRetestAfterItems } from '../../ai/ai.contracts';
import type {
  SkipReviewSessionItemDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import {
  ReviewResourceNotFoundError,
  ReviewSessionsRepository,
  type CommitReviewAnswerInput,
  type PostAnswerDiagnosisSnapshot,
  type ReviewAnswerSubmissionContext,
} from '../repositories/review-sessions.repository';
import type { VocabularyQuestionSnapshot } from '../repositories/review-questions.repository';
import { AnswerGradingService } from './answer-grading.service';
import { InvisibleReviewScoringService } from './invisible-review-scoring.service';
import { QuestionSelectionService } from './question-selection.service';

const MAX_RETRY_COUNT = 1;
const DEFAULT_RETEST_AFTER_ITEMS: ReviewRetestAfterItems = 3;

/**
 * Application boundary for the answer/skip transaction flow. Keeping this
 * dependency separate lets controller-facing orchestration evolve without
 * exposing transaction details to the general reviews service.
 */
@Injectable()
export class ReviewAnswerTransactionService {
  constructor(
    private readonly sessions: ReviewSessionsRepository,
    private readonly answerGrading: AnswerGradingService,
    private readonly reviewScoring: InvisibleReviewScoringService,
    private readonly questionSelection: QuestionSelectionService,
  ) {}

  async submit(userId: string, sessionId: string, dto: SubmitReviewAnswerDto) {
    const context = await this.sessions.getAnswerSubmissionContext(
      userId,
      sessionId,
      dto,
    );
    const grading = this.answerGrading.grade(context.item.question, {
      ...(dto.selectedOptionId === undefined
        ? {}
        : { selectedOptionId: dto.selectedOptionId }),
      ...(dto.userAnswerText === undefined
        ? {}
        : { userAnswerText: dto.userAnswerText }),
    });
    const now = new Date();
    const inferredScore = this.reviewScoring.inferScore({
      isCorrect: grading.isCorrect,
      previousFailedAttempts: context.item.retryCount,
      hintsUsed: dto.hintsUsed ?? 0,
      questionType: context.item.question.questionType,
      responseTimeMs: dto.responseTimeMs ?? null,
    });
    const retryQuestion = this.selectRetryQuestion(context, grading.isCorrect);
    const shouldRetry = retryQuestion !== null;
    const completed = grading.isCorrect || !shouldRetry;
    const fallbackRetestAfterItems = shouldRetry
      ? this.defaultRetestOffset(context.pendingItemsAfterCurrent.length)
      : null;
    const vocabularySchedule = context.vocabulary
      ? shouldRetry
        ? this.reviewScoring.schedule(0, context.vocabulary, now, true)
        : this.reviewScoring.schedule(
            inferredScore,
            context.vocabulary,
            now,
            !grading.isCorrect && context.item.retryCount === 0,
          )
      : undefined;
    const commit = this.toCommitInput({
      sessionId,
      dto,
      context,
      grading,
      inferredScore,
      now,
      completed,
      retryQuestion,
      fallbackRetestAfterItems,
      vocabularySchedule,
    });
    const committed = await this.sessions.commitAnswerSubmission(
      userId,
      commit,
    );
    const diagnosisSnapshot = await this.buildDiagnosisSnapshot({
      userId,
      context,
      dto,
      grading,
      retryQuestion,
      fallbackRetestAfterItems,
      answerId: committed.answerId,
      now,
    });

    return {
      ...committed,
      isCorrect: grading.isCorrect,
      correctAnswer: grading.correctAnswer,
      explanation: grading.explanation,
      earnedPoints: grading.earnedPoints,
      inferredReviewScore: inferredScore,
      willReturnLater: shouldRetry,
      ...(diagnosisSnapshot ? { diagnosisSnapshot } : {}),
    };
  }

  async skip(userId: string, sessionId: string, dto: SkipReviewSessionItemDto) {
    const context = await this.sessions.getSkipItemContext(
      userId,
      sessionId,
      dto,
    );
    const vocabularySchedule = context.vocabulary
      ? this.reviewScoring.schedule(
          0,
          context.vocabulary,
          new Date(),
          context.retryCount === 0,
        )
      : undefined;
    return this.sessions.skipItem(userId, sessionId, dto, vocabularySchedule);
  }

  private selectRetryQuestion(
    context: ReviewAnswerSubmissionContext,
    isCorrect: boolean,
  ): { id: string; questionType: QuestionType } | null {
    const wantsRetry = !isCorrect && context.item.retryCount < MAX_RETRY_COUNT;
    if (!wantsRetry || context.pendingItemsAfterCurrent.length < 2) {
      return null;
    }
    if (!context.vocabulary) throw new ReviewResourceNotFoundError();

    const preferredTypes = this.questionSelection.preferredTypes(
      context.vocabulary,
      context.recentAttempts.map(({ questionType, isCorrect: wasCorrect }) => ({
        questionType,
        isCorrect: wasCorrect,
      })),
      context.item.question.questionType,
    );
    const candidates = context.retryQuestionCandidates;
    for (const questionType of preferredTypes) {
      const selected = candidates.find(
        (candidate) => candidate.questionType === questionType,
      );
      if (selected) return selected;
    }
    return null;
  }

  private toCommitInput({
    sessionId,
    dto,
    context,
    grading,
    inferredScore,
    now,
    completed,
    retryQuestion,
    fallbackRetestAfterItems,
    vocabularySchedule,
  }: {
    sessionId: string;
    dto: SubmitReviewAnswerDto;
    context: ReviewAnswerSubmissionContext;
    grading: ReturnType<AnswerGradingService['grade']>;
    inferredScore: number;
    now: Date;
    completed: boolean;
    retryQuestion: { id: string; questionType: QuestionType } | null;
    fallbackRetestAfterItems: ReviewRetestAfterItems | null;
    vocabularySchedule: CommitReviewAnswerInput['vocabularySchedule'];
  }): CommitReviewAnswerInput {
    const shouldRetry = retryQuestion !== null;
    return {
      expected: {
        sessionId,
        reviewSessionItemId: context.item.id,
        reviewQuestionId: context.item.question.id,
        retryCount: context.item.retryCount,
        answerCount: context.item.answerCount,
        userVocabularyId: context.item.userVocabularyId,
      },
      answer: {
        selectedOptionId: grading.selectedOptionId,
        userAnswerText: dto.userAnswerText ?? null,
        isCorrect: grading.isCorrect,
        responseTimeMs: dto.responseTimeMs ?? null,
        hintsUsed: dto.hintsUsed ?? 0,
        inferredReviewScore: inferredScore,
        skillDimension: this.questionSelection.skillDimensionFor(
          context.item.question.questionType,
        ),
        answeredAt: now,
      },
      item: {
        status: completed
          ? ReviewSessionItemStatus.COMPLETED
          : ReviewSessionItemStatus.PENDING,
        retryCount: shouldRetry
          ? context.item.retryCount + 1
          : context.item.retryCount,
        finalInferredScore: completed ? inferredScore : null,
        completedAt: completed ? now : null,
        ...(retryQuestion ? { retryQuestionId: retryQuestion.id } : {}),
        ...(fallbackRetestAfterItems !== null
          ? { moveAfterPendingItems: fallbackRetestAfterItems }
          : {}),
      },
      ...(vocabularySchedule ? { vocabularySchedule } : {}),
    };
  }

  private async buildDiagnosisSnapshot({
    userId,
    context,
    dto,
    grading,
    retryQuestion,
    fallbackRetestAfterItems,
    answerId,
    now,
  }: {
    userId: string;
    context: ReviewAnswerSubmissionContext;
    dto: SubmitReviewAnswerDto;
    grading: ReturnType<AnswerGradingService['grade']>;
    retryQuestion: { id: string; questionType: QuestionType } | null;
    fallbackRetestAfterItems: ReviewRetestAfterItems | null;
    answerId: string;
    now: Date;
  }): Promise<PostAnswerDiagnosisSnapshot | undefined> {
    const vocabulary = context.vocabulary;
    if (
      grading.isCorrect ||
      !retryQuestion ||
      !vocabulary ||
      fallbackRetestAfterItems === null
    ) {
      return undefined;
    }
    const skillAggregates =
      await this.sessions.getAnswerDiagnosisSkillAggregates(userId, now);
    const learnerAnswer =
      grading.selectedOptionId === null
        ? (dto.userAnswerText ?? '')
        : (context.item.question.options.find(
            ({ id }) => id === grading.selectedOptionId,
          )?.optionText ?? '');

    return {
      request: {
        reviewSessionItemId: context.item.id,
        reviewAnswerId: answerId,
        isCorrect: false,
        wasSkipped: false,
        lapseCount: vocabulary.lapseCount,
        input: {
          targetCefr: vocabulary.savedCefrLevel,
          wordOrPhrase: vocabulary.savedWordDisplay,
          lemma: vocabulary.savedLemma,
          partOfSpeech: vocabulary.savedPartOfSpeech,
          contextualMeaningVi: vocabulary.savedMeaningVi,
          originalSentence: vocabulary.savedContextSentence,
          questionType: context.item.question.questionType,
          learnerAnswer,
          correctAnswer: grading.correctAnswer,
          responseTimeMs: dto.responseTimeMs ?? 0,
          hintsUsed: dto.hintsUsed ?? 0,
          attemptNumber: context.item.answerCount + 1,
          recentAttempts: context.recentAttempts.map(
            ({
              questionType,
              skillDimension,
              isCorrect,
              responseTimeMs,
              hintsUsed,
            }) => ({
              questionType,
              skillDimension,
              isCorrect,
              responseTimeMs: responseTimeMs ?? 0,
              hintsUsed,
            }),
          ),
          skillAggregates: skillAggregates.map(
            ({
              skillDimension,
              attemptCount,
              correctCount,
              averageResponseTimeMs,
            }) => ({
              skillDimension,
              attempts: attemptCount,
              correct: correctCount,
              averageResponseTimeMs: averageResponseTimeMs ?? 0,
            }),
          ),
          allowedSkillDimensions: [
            ReviewSkillDimension.RECOGNITION,
            ReviewSkillDimension.RECALL,
            ReviewSkillDimension.SPELLING,
            ReviewSkillDimension.CONTEXT,
          ],
          allowedActions: [
            ReviewAgentAction.CONTINUE,
            ReviewAgentAction.REQUEUE_WITH_NEW_TYPE,
            ReviewAgentAction.TEACH_AND_REQUEUE,
            ReviewAgentAction.FLAG_FOR_FUTURE_FOCUS,
          ],
          allowedRetestQuestionTypes: [
            retryQuestion.questionType,
            ...Object.values(QuestionType).filter(
              (candidate) =>
                candidate !== context.item.question.questionType &&
                candidate !== retryQuestion.questionType,
            ),
          ],
          allowedRetestAfterItems: [2, 3, 4, 5].filter(
            (offset): offset is ReviewRetestAfterItems =>
              offset <= context.pendingItemsAfterCurrent.length,
          ),
        },
      },
      vocabulary: this.toQuestionSnapshot(vocabulary),
      originalQuestionType: context.item.question.questionType,
      fallbackRetestQuestionType: retryQuestion.questionType,
      fallbackRetestAfterItems,
      attemptNumber: context.item.answerCount + 1,
    };
  }

  private defaultRetestOffset(availableItems: number): ReviewRetestAfterItems {
    return availableItems >= DEFAULT_RETEST_AFTER_ITEMS ? 3 : 2;
  }

  private toQuestionSnapshot(
    vocabulary: NonNullable<ReviewAnswerSubmissionContext['vocabulary']>,
  ): VocabularyQuestionSnapshot {
    return {
      id: vocabulary.id,
      articleSentenceTermId: vocabulary.articleSentenceTermId,
      savedWordDisplay: vocabulary.savedWordDisplay,
      savedLemma: vocabulary.savedLemma,
      savedPartOfSpeech: vocabulary.savedPartOfSpeech,
      savedCefrLevel: vocabulary.savedCefrLevel,
      savedContextSentence: vocabulary.savedContextSentence,
      savedMeaningVi: vocabulary.savedMeaningVi,
      savedExplanation: vocabulary.savedExplanation,
      categoryId: vocabulary.articleSentenceTerm.sentence.article.categoryId,
      articleTopic:
        vocabulary.articleSentenceTerm.sentence.article.category?.name,
    };
  }
}
