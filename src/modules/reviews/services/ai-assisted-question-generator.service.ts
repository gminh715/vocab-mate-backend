import { Inject, Injectable } from '@nestjs/common';
import { logWarn } from '../../../common/logging/structured-logger';
import type { AiConfig } from '../../../config/ai.config';
import { AI_CONFIG } from '../../../config/config.module';
import {
  QuestionGenerationSource,
  QuestionType,
} from '../../../../generated/prisma/enums';
import type {
  ReviewQuestionGenerationInput,
  ReviewQuestionGenerationResult,
  ReviewQuestionPromptStyle,
  ReviewQuestionType,
} from '../../ai/ai.contracts';
import {
  REVIEW_QUESTION_BATCH_MAX_SIZE,
  REVIEW_QUESTION_PROMPT_STYLES,
  REVIEW_QUESTION_PROMPT_VERSION,
} from '../../ai/ai.contracts';
import { AiError } from '../../ai/ai.errors';
import { AiService } from '../../ai/ai.service';
import {
  type GeneratedAiQuestionSpec,
  type AiQuestionGenerationCandidate,
  type PreparedAiReviewQuestion,
  NoUsableReviewQuestionError,
} from '../repositories/review-sessions.repository';
import { ReviewQuestionsRepository } from '../repositories/review-questions.repository';
import { ReviewAgentRepository } from '../repositories/review-agent.repository';
import type { StartReviewSessionDto } from '../dto/review-request.dto';

class ReviewAiCallBudgetExhaustedError extends Error {}

interface IndexedGenerationCandidate {
  candidate: AiQuestionGenerationCandidate;
  index: number;
}

export interface ReviewQuestionWarmProgress {
  completedItems: number;
  totalItems: number;
}

const MAX_CONCURRENT_WARM_BATCHES = 2;

@Injectable()
export class AiAssistedQuestionGeneratorService {
  private readonly inFlight = new Map<string, Promise<{ id: string }>>();
  private readonly batchInFlight = new Map<
    string,
    Promise<Array<{ id: string }>>
  >();

  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    private readonly aiService: AiService,
    private readonly questionsRepository: ReviewQuestionsRepository,
    private readonly agentRepository: ReviewAgentRepository,
  ) {}

  async warmCache(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
    onAiCallReserved: () => void = () => undefined,
    onProgress: (progress: ReviewQuestionWarmProgress) => void = () =>
      undefined,
  ): Promise<PreparedAiReviewQuestion[]> {
    const candidates = await this.questionsRepository.getGenerationCandidates(
      userId,
      dto,
      now,
    );
    const prepared = candidates.map(({ cachedQuestion }) => cachedQuestion);
    const missing = candidates.flatMap((candidate, index) =>
      prepared[index] ? [] : [{ candidate, index }],
    );
    const initialCompletedItems = candidates.length - missing.length;
    let processedMissingItems = 0;
    onProgress({
      completedItems: initialCompletedItems,
      totalItems: candidates.length,
    });

    const batches: IndexedGenerationCandidate[][] = [];
    for (
      let offset = 0;
      offset < missing.length;
      offset += REVIEW_QUESTION_BATCH_MAX_SIZE
    ) {
      batches.push(
        missing.slice(offset, offset + REVIEW_QUESTION_BATCH_MAX_SIZE),
      );
    }

    let nextBatchIndex = 0;
    const processBatch = async (batch: IndexedGenerationCandidate[]) => {
      try {
        const latestCached = await Promise.all(
          batch.map(({ candidate }) =>
            this.questionsRepository.findCached(
              candidate.vocabulary.articleSentenceTermId,
              candidate.vocabulary.savedCefrLevel,
              candidate.questionType,
            ),
          ),
        );
        const unresolved = batch.filter(({ candidate, index }, batchIndex) => {
          const cached = latestCached[batchIndex];
          if (!cached) return true;
          prepared[index] = this.toPreparedQuestion(candidate, cached.id);
          return false;
        });
        if (unresolved.length === 0) return;

        const batchKey = unresolved
          .map(({ candidate }) =>
            this.cacheKey(candidate, candidate.questionType),
          )
          .join('|');
        let generation = this.batchInFlight.get(batchKey);
        if (!generation) {
          onAiCallReserved();
          generation = this.generateAndCacheBatch(unresolved).finally(() =>
            this.batchInFlight.delete(batchKey),
          );
          this.batchInFlight.set(batchKey, generation);
        }
        try {
          const questions = await generation;
          unresolved.forEach(({ candidate, index }, questionIndex) => {
            const question = questions[questionIndex];
            if (question) {
              prepared[index] = this.toPreparedQuestion(candidate, question.id);
            }
          });
        } catch (error: unknown) {
          if (!(error instanceof AiError)) throw error;
          const failureReason = error.providerFailureReason ?? 'unknown';
          logWarn('review.ai_question_batch_fallback', {
            reasonCode: error.code,
            providerFailureReason: failureReason,
            candidateCount: unresolved.length,
          });
          const fallbacks = await Promise.all(
            unresolved.map(({ candidate }) =>
              this.questionsRepository.findPreferredCached(
                candidate.vocabulary.id,
                candidate.vocabulary.articleSentenceTermId,
                candidate.vocabulary.savedCefrLevel,
                candidate.preferredQuestionTypes,
              ),
            ),
          );
          for (const [fallbackIndex, entry] of unresolved.entries()) {
            const fallback = fallbacks[fallbackIndex];
            if (fallback) {
              prepared[entry.index] = fallback;
              continue;
            }
            try {
              const question = await this.ensureCached(
                entry.candidate,
                entry.candidate.questionType,
                () => {
                  onAiCallReserved();
                  return Promise.resolve(true);
                },
              );
              prepared[entry.index] = this.toPreparedQuestion(
                entry.candidate,
                question.id,
              );
            } catch (retryError: unknown) {
              if (!(retryError instanceof AiError)) throw retryError;
              logWarn('review.ai_question_retry_failed', {
                reasonCode: retryError.code,
                candidateCount: unresolved.length,
              });
              throw new NoUsableReviewQuestionError();
            }
          }
        }
      } finally {
        processedMissingItems += batch.length;
        onProgress({
          completedItems: initialCompletedItems + processedMissingItems,
          totalItems: candidates.length,
        });
      }
    };

    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT_WARM_BATCHES, batches.length) },
      async () => {
        while (nextBatchIndex < batches.length) {
          const batch = batches[nextBatchIndex];
          nextBatchIndex += 1;
          if (batch) await processBatch(batch);
        }
      },
    );
    await Promise.all(workers);

    const complete = prepared.filter(
      (question): question is PreparedAiReviewQuestion => question !== null,
    );
    if (complete.length !== candidates.length) {
      throw new NoUsableReviewQuestionError();
    }
    return complete;
  }

  async prepareRetestQuestion(
    userId: string,
    reviewSessionId: string,
    vocabulary: AiQuestionGenerationCandidate['vocabulary'],
    questionType: QuestionType,
  ): Promise<PreparedAiReviewQuestion | null> {
    const candidate: AiQuestionGenerationCandidate = {
      vocabulary,
      questionType,
      preferredQuestionTypes: [questionType],
      cachedQuestion: null,
    };
    try {
      const question = await this.ensureCached(candidate, questionType, () =>
        this.agentRepository.reserveCall(
          userId,
          reviewSessionId,
          this.config.reviewMaxCallsPerSession,
        ),
      );
      return this.toPreparedQuestion(candidate, question.id);
    } catch (error: unknown) {
      if (
        !(error instanceof AiError) &&
        !(error instanceof ReviewAiCallBudgetExhaustedError)
      ) {
        throw error;
      }
      logWarn('review.ai_retest_question_fallback', {
        reasonCode:
          error instanceof AiError ? error.code : 'AI_CALL_BUDGET_EXHAUSTED',
        questionType,
      });
      return this.questionsRepository.findPreferredCached(
        vocabulary.id,
        vocabulary.articleSentenceTermId,
        vocabulary.savedCefrLevel,
        [questionType],
      );
    }
  }

  private async ensureCached(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
    reserveProviderCall?: () => Promise<boolean>,
  ): Promise<{ id: string }> {
    const key = this.cacheKey(candidate, questionType);
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const cached = await this.questionsRepository.findCached(
      candidate.vocabulary.articleSentenceTermId,
      candidate.vocabulary.savedCefrLevel,
      questionType,
    );
    if (cached) return cached;

    const concurrent = this.inFlight.get(key);
    if (concurrent) return concurrent;
    const generation = (async () => {
      if (reserveProviderCall && !(await reserveProviderCall())) {
        throw new ReviewAiCallBudgetExhaustedError();
      }
      return this.generateAndCache(candidate, questionType);
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, generation);
    return generation;
  }

  private async generateAndCache(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
  ): Promise<{ id: string }> {
    const input = this.toGenerationInput(
      candidate,
      questionType,
      this.promptStyleForSeed(this.cacheKey(candidate, questionType)),
    );
    const generated = await this.aiService.generateReviewQuestion(input);
    return this.questionsRepository.cache(
      this.toQuestionSpec(candidate, questionType, generated),
    );
  }

  private async generateAndCacheBatch(
    batch: IndexedGenerationCandidate[],
  ): Promise<Array<{ id: string }>> {
    const inputs = batch.map(({ candidate, index }) =>
      this.toGenerationInput(
        candidate,
        candidate.questionType,
        this.promptStyleAt(index),
      ),
    );
    const generated = await this.aiService.generateReviewQuestions(inputs);
    return Promise.all(
      generated.map((question, index) => {
        const entry = batch[index];
        if (!entry) {
          throw new Error('AI review question batch order is invalid');
        }
        return this.questionsRepository.cache(
          this.toQuestionSpec(
            entry.candidate,
            entry.candidate.questionType,
            question,
          ),
        );
      }),
    );
  }

  private toGenerationInput(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
    promptStyle: ReviewQuestionPromptStyle,
  ): ReviewQuestionGenerationInput {
    const vocabulary = candidate.vocabulary;
    const baseInput = {
      wordOrPhrase: vocabulary.savedWordDisplay,
      contextualMeaningVi: vocabulary.savedMeaningVi,
      targetCefr: vocabulary.savedCefrLevel,
      requestedQuestionType: this.toAiQuestionType(questionType),
      promptStyle,
    };
    return questionType === QuestionType.SELECT_WORD ||
      questionType === QuestionType.FILL_BLANK
      ? {
          ...baseInput,
          partOfSpeech: vocabulary.savedPartOfSpeech,
        }
      : {
          ...baseInput,
          originalSentence: vocabulary.savedContextSentence,
        };
  }

  private toQuestionSpec(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
    generated: ReviewQuestionGenerationResult,
  ): GeneratedAiQuestionSpec {
    const vocabulary = candidate.vocabulary;
    return {
      quizId: null,
      articleSentenceTermId: vocabulary.articleSentenceTermId,
      questionType,
      generationSource: QuestionGenerationSource.AI,
      generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
      difficultyCefr: vocabulary.savedCefrLevel,
      prompt: generated.prompt,
      blankSentence: generated.blankSentence,
      correctAnswerText:
        questionType === QuestionType.FILL_BLANK
          ? vocabulary.savedWordDisplay
          : null,
      answerExplanation: generated.answerExplanation,
      isCaseSensitive: false,
      points: 1,
      displayOrder: 1,
      isActive: true,
      options: this.buildOptions(candidate, questionType, generated).map(
        (option, index) => ({
          optionText: option.optionText,
          isCorrect: option.isCorrect,
          explanation: null,
          displayOrder: index + 1,
        }),
      ),
    };
  }

  private buildOptions(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
    generated: ReviewQuestionGenerationResult,
  ): Array<{ optionText: string; isCorrect: boolean }> {
    if (questionType === QuestionType.FILL_BLANK) return [];
    const options = generated.distractors.map((optionText) => ({
      optionText,
      isCorrect: false,
    }));
    const correctOption = {
      optionText: this.correctAnswer(candidate, questionType),
      isCorrect: true,
    };
    const insertionIndex =
      this.stableHash(this.cacheKey(candidate, questionType)) %
      (options.length + 1);
    options.splice(insertionIndex, 0, correctOption);
    return options;
  }

  private correctAnswer(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
  ): string {
    const vocabulary = candidate.vocabulary;
    if (questionType === QuestionType.SELECT_MEANING) {
      return vocabulary.savedMeaningVi;
    }
    if (questionType === QuestionType.SELECT_CORRECT_CONTEXT) {
      return vocabulary.savedContextSentence;
    }
    return vocabulary.savedWordDisplay;
  }

  private cacheKey(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
  ): string {
    return [
      candidate.vocabulary.articleSentenceTermId,
      candidate.vocabulary.savedCefrLevel,
      questionType,
      REVIEW_QUESTION_PROMPT_VERSION,
    ].join(':');
  }

  private promptStyleAt(index: number): ReviewQuestionPromptStyle {
    return (
      REVIEW_QUESTION_PROMPT_STYLES[
        index % REVIEW_QUESTION_PROMPT_STYLES.length
      ] ?? REVIEW_QUESTION_PROMPT_STYLES[0]
    );
  }

  private promptStyleForSeed(seed: string): ReviewQuestionPromptStyle {
    return this.promptStyleAt(this.stableHash(seed));
  }

  private stableHash(seed: string): number {
    let hash = 0;
    for (const character of seed) {
      hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
    }
    return hash;
  }

  private toPreparedQuestion(
    candidate: AiQuestionGenerationCandidate,
    quizQuestionId: string,
  ): PreparedAiReviewQuestion {
    return {
      userVocabularyId: candidate.vocabulary.id,
      quizQuestionId,
      articleSentenceTermId: candidate.vocabulary.articleSentenceTermId,
      difficultyCefr: candidate.vocabulary.savedCefrLevel,
      questionType: candidate.questionType,
    };
  }

  private toAiQuestionType(questionType: QuestionType): ReviewQuestionType {
    switch (questionType) {
      case QuestionType.SELECT_MEANING:
        return 'SELECT_MEANING';
      case QuestionType.SELECT_WORD:
        return 'SELECT_WORD';
      case QuestionType.SELECT_CORRECT_CONTEXT:
        return 'SELECT_CORRECT_CONTEXT';
      case QuestionType.FILL_BLANK:
        return 'FILL_BLANK';
    }
  }
}
