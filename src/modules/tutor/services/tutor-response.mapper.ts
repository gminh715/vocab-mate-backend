import { Injectable } from '@nestjs/common';
import type {
  TutorSession,
  TutorSessionItem,
} from '../../../../generated/prisma/client';
import {
  TutorSessionAnsweredItemDto,
  TutorSessionPendingItemDto,
} from '../dto/session-item-response.dto';
import { TutorSessionSummaryDto } from '../dto/session-response.dto';
import {
  RatingDistributionDto,
  TutorSessionSummaryStatsDto,
} from '../dto/session-summary-stats.dto';

interface GradingSpecPayload {
  correctAnswer?: unknown;
  explanationVi?: string;
  feedbackCorrectVi?: string;
  feedbackIncorrectVi?: string;
}

interface QuestionPayload {
  wordDisplay?: string;
  [key: string]: unknown;
}

@Injectable()
export class TutorResponseMapper {
  /**
   * Maps a Prisma TutorSession entity to a clean public TutorSessionSummaryDto.
   * Formats the studyDate Date object to standard YYYY-MM-DD string.
   */
  mapSessionSummary(session: TutorSession): TutorSessionSummaryDto {
    const studyDateStr =
      session.studyDate instanceof Date
        ? session.studyDate.toISOString().slice(0, 10)
        : String(session.studyDate).slice(0, 10);

    return {
      id: session.id,
      userId: session.userId,
      studyDate: studyDateStr,
      status: session.status,
      targetDurationMinutes: session.targetDurationMinutes,
      targetActivityCount: session.targetActivityCount,
      newWordTarget: session.newWordTarget,
      warmupFacts: session.warmupFacts ?? null,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /**
   * Maps a PENDING or SKIPPED item.
   * Strips the private server-side gradingSpec completely.
   */
  mapPendingItem(item: TutorSessionItem): TutorSessionPendingItemDto {
    return {
      id: item.id,
      sessionId: item.sessionId,
      userVocabularyId: item.userVocabularyId,
      position: item.position,
      status: item.status,
      questionType: item.questionType,
      isNewWord: item.isNewWord,
      questionPayload: (item.questionPayload as Record<string, unknown>) ?? {},
      hintUsed: item.hintUsed,
      generatedAt: item.generatedAt,
    };
  }

  /**
   * Maps an ANSWERED item.
   * Safely unpacks canonical answer keys from gradingSpec.
   */
  mapAnsweredItem(item: TutorSessionItem): TutorSessionAnsweredItemDto {
    const pendingBase = this.mapPendingItem(item);
    const grading = (item.gradingSpec as GradingSpecPayload) ?? {};

    return {
      ...pendingBase,
      userAnswer: item.userAnswer,
      isCorrect: item.isCorrect,
      responseTimeMs: item.responseTimeMs,
      fsrsRating: item.fsrsRating,
      feedbackVi: item.feedbackVi ?? null,
      correctAnswer: grading.correctAnswer ?? null,
      explanationVi: grading.explanationVi ?? null,
      answeredAt: item.answeredAt,
    };
  }

  /**
   * Maps any item based on its status.
   * If ANSWERED, exposes answer keys; otherwise strips them.
   */
  mapItem(
    item: TutorSessionItem,
  ): TutorSessionPendingItemDto | TutorSessionAnsweredItemDto {
    return item.status === 'ANSWERED'
      ? this.mapAnsweredItem(item)
      : this.mapPendingItem(item);
  }

  /**
   * Computes session summary statistics deterministically without calling LLM.
   */
  calculateSummaryStats(
    session: TutorSession,
    items: TutorSessionItem[],
    nextDueCount: number,
  ): TutorSessionSummaryStatsDto {
    const answeredItems = items.filter((i) => i.status === 'ANSWERED');

    let durationSeconds = 0;
    if (session.completedAt && session.startedAt) {
      durationSeconds = Math.max(
        0,
        Math.floor(
          (session.completedAt.getTime() - session.startedAt.getTime()) / 1000,
        ),
      );
    } else {
      const totalResponseMs = answeredItems.reduce(
        (sum, item) => sum + (item.responseTimeMs ?? 0),
        0,
      );
      durationSeconds = Math.floor(totalResponseMs / 1000);
    }

    const correctCount = answeredItems.filter(
      (i) => i.isCorrect === true,
    ).length;
    const incorrectCount = answeredItems.filter(
      (i) => i.isCorrect === false,
    ).length;
    const newWordsStudied = answeredItems.filter((i) => i.isNewWord).length;
    const reviewWordsStudied = answeredItems.filter((i) => !i.isNewWord).length;

    const ratingDistribution: RatingDistributionDto = {
      again: answeredItems.filter((i) => i.fsrsRating === 1).length,
      hard: answeredItems.filter((i) => i.fsrsRating === 2).length,
      good: answeredItems.filter((i) => i.fsrsRating === 3).length,
      easy: answeredItems.filter((i) => i.fsrsRating === 4).length,
    };

    // Relearning words: items where user failed or received Rating 1 (Again)
    const relearningWordsSet = new Set<string>();
    for (const item of answeredItems) {
      if (item.isCorrect === false || item.fsrsRating === 1) {
        const payload = item.questionPayload as QuestionPayload;
        if (payload?.wordDisplay) {
          relearningWordsSet.add(payload.wordDisplay);
        }
      }
    }

    return {
      durationSeconds,
      plannedActivities: session.targetActivityCount,
      completedActivities: answeredItems.length,
      correctCount,
      incorrectCount,
      newWordsStudied,
      reviewWordsStudied,
      ratingDistribution,
      relearningWords: Array.from(relearningWordsSet),
      nextDueCount,
    };
  }
}
