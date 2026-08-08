import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiConfig } from '../../../config/ai.config';
import { AI_CONFIG } from '../../../config/config.module';
import {
  QuestionGenerationSource,
  QuestionType,
} from '../../../../generated/prisma/enums';
import type {
  ReviewQuestionGenerationInput,
  ReviewQuestionType,
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

@Injectable()
export class AiAssistedQuestionGeneratorService {
  private readonly logger = new Logger(AiAssistedQuestionGeneratorService.name);
  private readonly inFlight = new Map<string, Promise<{ id: string }>>();

  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    private readonly aiService: AiService,
    private readonly reviewsRepository: ReviewsRepository,
  ) {}

  async warmCache(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
  ): Promise<PreparedAiReviewQuestion[]> {
    const candidates =
      await this.reviewsRepository.getAiQuestionGenerationCandidates(
        userId,
        dto,
        now,
      );
    const prepared = candidates.map(({ cachedQuestion }) => cachedQuestion);
    let reservedGenerationCount = 0;

    for (const [index, candidate] of candidates.entries()) {
      if (prepared[index]) continue;
      if (reservedGenerationCount >= this.config.reviewQuestionWarmLimit) {
        continue;
      }
      reservedGenerationCount += 1;

      try {
        const question = await this.ensureCached(
          candidate,
          candidate.questionType,
        );
        prepared[index] = this.toPreparedQuestion(candidate, question.id);
      } catch (error: unknown) {
        if (!(error instanceof AiError)) throw error;
        this.logger.warn(
          `AI review question unavailable; omitting candidate (${error.code})`,
        );
        prepared[index] =
          await this.reviewsRepository.findPreferredCachedAiQuestion(
            candidate.vocabulary.id,
            candidate.vocabulary.articleSentenceTermId,
            candidate.vocabulary.savedCefrLevel,
            candidate.preferredQuestionTypes,
          );
      }
    }

    return prepared.filter(
      (question): question is PreparedAiReviewQuestion => question !== null,
    );
  }

  async prepareRetestQuestion(
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
      const question = await this.ensureCached(candidate, questionType);
      return this.toPreparedQuestion(candidate, question.id);
    } catch (error: unknown) {
      if (!(error instanceof AiError)) throw error;
      this.logger.warn(
        `AI retest question unavailable; keeping deterministic transition (${error.code})`,
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
  ): Promise<{ id: string }> {
    const key = [
      candidate.vocabulary.articleSentenceTermId,
      candidate.vocabulary.savedCefrLevel,
      questionType,
    ].join(':');
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
    const generation = this.generateAndCache(candidate, questionType).finally(
      () => this.inFlight.delete(key),
    );
    this.inFlight.set(key, generation);
    return generation;
  }

  private async generateAndCache(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
  ): Promise<{ id: string }> {
    const vocabulary = candidate.vocabulary;
    const input: ReviewQuestionGenerationInput = {
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
    };
    const generated = await this.aiService.generateReviewQuestion(input);
    const spec: GeneratedAiQuestionSpec = {
      quizId: null,
      articleSentenceTermId: vocabulary.articleSentenceTermId,
      questionType,
      generationSource: QuestionGenerationSource.AI,
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
    return this.reviewsRepository.cacheAiQuestion(spec);
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
