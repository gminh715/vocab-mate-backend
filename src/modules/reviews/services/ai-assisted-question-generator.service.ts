import { Inject, Injectable, Logger } from '@nestjs/common';
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
  ReviewsRepository,
} from '../reviews.repository';
import type { StartReviewSessionDto } from '../dto/review-request.dto';

class ReviewAiCallBudgetExhaustedError extends Error {}

interface IndexedGenerationCandidate {
  candidate: AiQuestionGenerationCandidate;
  index: number;
}

@Injectable()
export class AiAssistedQuestionGeneratorService {
  private readonly logger = new Logger(AiAssistedQuestionGeneratorService.name);
  private readonly inFlight = new Map<string, Promise<{ id: string }>>();
  private readonly batchInFlight = new Map<
    string,
    Promise<Array<{ id: string }>>
  >();

  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    private readonly aiService: AiService,
    private readonly reviewsRepository: ReviewsRepository,
  ) {}

  async warmCache(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
    onAiCallReserved: () => void = () => undefined,
  ): Promise<PreparedAiReviewQuestion[]> {
    const candidates =
      await this.reviewsRepository.getAiQuestionGenerationCandidates(
        userId,
        dto,
        now,
      );
    const prepared = candidates.map(({ cachedQuestion }) => cachedQuestion);
    let generatedBatchCount = 0;
    const batchLimit = Math.min(
      this.config.reviewQuestionWarmLimit,
      this.config.reviewMaxCallsPerSession,
    );
    const missing = candidates.flatMap((candidate, index) =>
      prepared[index] ? [] : [{ candidate, index }],
    );

    for (
      let offset = 0;
      offset < missing.length;
      offset += REVIEW_QUESTION_BATCH_MAX_SIZE
    ) {
      const batch = missing.slice(
        offset,
        offset + REVIEW_QUESTION_BATCH_MAX_SIZE,
      );
      const latestCached = await Promise.all(
        batch.map(({ candidate }) =>
          this.reviewsRepository.findCachedAiQuestion(
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
      if (unresolved.length === 0) continue;

      const batchKey = unresolved
        .map(({ candidate }) =>
          this.cacheKey(candidate, candidate.questionType),
        )
        .join('|');
      let generation = this.batchInFlight.get(batchKey);
      if (!generation) {
        if (generatedBatchCount >= batchLimit) continue;
        generatedBatchCount += 1;
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
        this.logger.warn(
          `AI review question batch unavailable; omitting candidates without a compatible cache (${error.code}: ${failureReason})`,
        );
        const fallbacks = await Promise.all(
          unresolved.map(({ candidate }) =>
            this.reviewsRepository.findPreferredCachedAiQuestion(
              candidate.vocabulary.id,
              candidate.vocabulary.articleSentenceTermId,
              candidate.vocabulary.savedCefrLevel,
              candidate.preferredQuestionTypes,
            ),
          ),
        );
        unresolved.forEach(({ index }, fallbackIndex) => {
          prepared[index] = fallbacks[fallbackIndex];
        });
      }
    }

    return prepared.filter(
      (question): question is PreparedAiReviewQuestion => question !== null,
    );
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
        this.reviewsRepository.reserveAiCallSlot(
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
      this.logger.warn(
        error instanceof AiError
          ? `AI retest question unavailable; keeping deterministic transition (${error.code})`
          : 'AI retest question budget exhausted; keeping deterministic transition',
      );
      return this.reviewsRepository.findPreferredCachedAiQuestion(
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

    const cached = await this.reviewsRepository.findCachedAiQuestion(
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
    return this.reviewsRepository.cacheAiQuestion(
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
        return this.reviewsRepository.cacheAiQuestion(
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
    return {
      wordOrPhrase: vocabulary.savedWordDisplay,
      lemma: vocabulary.savedLemma,
      partOfSpeech: vocabulary.savedPartOfSpeech,
      contextualMeaningVi: vocabulary.savedMeaningVi,
      originalSentence: vocabulary.savedContextSentence,
      ...(vocabulary.articleTopic
        ? { articleTopic: vocabulary.articleTopic }
        : {}),
      targetCefr: vocabulary.savedCefrLevel,
      requestedQuestionType: this.toAiQuestionType(questionType),
      promptStyle,
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
      correctAnswerText: generated.correctAnswerText,
      answerExplanation: generated.answerExplanation,
      isCaseSensitive: false,
      points: 1,
      displayOrder: 1,
      isActive: true,
      options: generated.options.map((option, index) => ({
        optionText: option.optionText,
        isCorrect: option.isCorrect,
        explanation: null,
        displayOrder: index + 1,
      })),
    };
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
    let hash = 0;
    for (const character of seed) {
      hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
    }
    return this.promptStyleAt(hash);
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
