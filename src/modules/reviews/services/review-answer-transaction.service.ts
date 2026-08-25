import { Injectable } from '@nestjs/common';
import type {
  SkipReviewSessionItemDto,
  SubmitReviewAnswerDto,
} from '../dto/review-request.dto';
import { ReviewSessionsRepository } from '../repositories/review-sessions.repository';

/**
 * Application boundary for the answer/skip transaction flow. Keeping this
 * dependency separate lets controller-facing orchestration evolve without
 * exposing transaction details to the general reviews service.
 */
@Injectable()
export class ReviewAnswerTransactionService {
  constructor(private readonly sessions: ReviewSessionsRepository) {}

  submit(userId: string, sessionId: string, dto: SubmitReviewAnswerDto) {
    return this.sessions.submitAnswer(userId, sessionId, dto);
  }

  skip(userId: string, sessionId: string, dto: SkipReviewSessionItemDto) {
    return this.sessions.skipItem(userId, sessionId, dto);
  }
}
