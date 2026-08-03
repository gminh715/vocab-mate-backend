import { Injectable, Logger } from '@nestjs/common';
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
  type AiQuestionGenerationCandidate,
  ReviewsRepository,
} from '../reviews.repository';
import type { StartReviewSessionDto } from '../dto/review-request.dto';
import type { GeneratedQuestionSpec } from './rule-based-question-generator.service';

@Injectable()
export class AiAssistedQuestionGeneratorService {
  private readonly logger = new Logger(AiAssistedQuestionGeneratorService.name);
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly aiService: AiService,
    private readonly reviewsRepository: ReviewsRepository,
  ) {}

  async warmCache(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
  ): Promise<void> {
    const candidates =
      await this.reviewsRepository.getAiQuestionGenerationCandidates(
        userId,
        dto,
        now,
      );

    for (const candidate of candidates) {
      for (const questionType of candidate.questionTypes) {
        try {
          await this.ensureCached(candidate, questionType);
        } catch (error: unknown) {
          if (!(error instanceof AiError)) throw error;
          this.logger.warn(
            `AI review question unavailable; using rule-based fallback (${error.code})`,
          );
          return;
        }
      }
    }
  }

  private async ensureCached(
    candidate: AiQuestionGenerationCandidate,
    questionType: QuestionType,
  ): Promise<void> {
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
    if (cached) return;

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
  ): Promise<void> {
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
    const spec: GeneratedQuestionSpec = {
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
    await this.reviewsRepository.cacheAiQuestion(spec);
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
