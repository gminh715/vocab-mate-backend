import { Injectable } from '@nestjs/common';
import {
  type AiQuestionGenerationCandidate,
  type GeneratedAiQuestionSpec,
  type PreparedAiReviewQuestion,
  ReviewSessionsRepository,
} from './review-sessions.repository';
import type { StartReviewSessionDto } from '../dto/review-request.dto';
import type { CefrLevel, QuestionType } from '../../../../generated/prisma/enums';

/** Persistence boundary for generated and cached review questions. */
@Injectable()
export class ReviewQuestionsRepository {
  constructor(private readonly sessions: ReviewSessionsRepository) {}

  getGenerationCandidates(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
  ): Promise<AiQuestionGenerationCandidate[]> {
    return this.sessions.getAiQuestionGenerationCandidates(userId, dto, now);
  }

  findCached(
    articleSentenceTermId: string,
    difficultyCefr: CefrLevel,
    questionType: QuestionType,
  ) {
    return this.sessions.findCachedAiQuestion(
      articleSentenceTermId,
      difficultyCefr,
      questionType,
    );
  }

  findPreferredCached(
    userVocabularyId: string,
    articleSentenceTermId: string,
    difficultyCefr: CefrLevel,
    preferredQuestionTypes: QuestionType[],
  ): Promise<PreparedAiReviewQuestion | null> {
    return this.sessions.findPreferredCachedAiQuestion(
      userVocabularyId,
      articleSentenceTermId,
      difficultyCefr,
      preferredQuestionTypes,
    );
  }

  cache(spec: GeneratedAiQuestionSpec) {
    return this.sessions.cacheAiQuestion(spec);
  }
}
