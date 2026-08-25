import { Injectable } from '@nestjs/common';
import type {
  ApplyAnswerAgentDecisionInput,
  ApplySessionPlanDecisionInput,
  PersistReviewAgentDecisionInput,
} from './review-sessions.repository';
import { ReviewSessionsRepository } from './review-sessions.repository';

/** Persistence boundary for AI budgets and auditable review-agent decisions. */
@Injectable()
export class ReviewAgentRepository {
  constructor(private readonly sessions: ReviewSessionsRepository) {}

  reserveCall(userId: string, sessionId: string, maximumCalls: number) {
    return this.sessions.reserveAiCallSlot(userId, sessionId, maximumCalls);
  }

  reserveDiagnosisCall(
    userId: string,
    sessionId: string,
    maximumCalls: number,
    maximumDiagnosisCalls: number,
  ) {
    return this.sessions.reserveDiagnosisAiCallSlot(
      userId,
      sessionId,
      maximumCalls,
      maximumDiagnosisCalls,
    );
  }

  persist(userId: string, input: PersistReviewAgentDecisionInput) {
    return this.sessions.persistAgentDecision(userId, input);
  }

  applySessionPlan(userId: string, input: ApplySessionPlanDecisionInput) {
    return this.sessions.applySessionPlanDecision(userId, input);
  }

  applyAnswerDecision(userId: string, input: ApplyAnswerAgentDecisionInput) {
    return this.sessions.applyAnswerAgentDecision(userId, input);
  }
}
