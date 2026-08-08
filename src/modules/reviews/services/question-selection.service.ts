import { Injectable } from '@nestjs/common';
import {
  LearningStatus,
  QuestionType,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';

export const RECENT_ACCURACY_WINDOW = 5;
export const MINIMUM_ACCURACY_SAMPLE = 2;
export const LOW_RECENT_ACCURACY = 0.6;
export const GOOD_RECENT_ACCURACY = 0.8;

export interface QuestionSelectionVocabulary {
  learningStatus: LearningStatus;
  consecutiveCorrectReviews: number;
  lastReviewScore: number | null;
}

export interface RecentQuestionAttempt {
  questionType: QuestionType;
  isCorrect: boolean;
}

const ALL_TYPES = [
  QuestionType.SELECT_MEANING,
  QuestionType.SELECT_CORRECT_CONTEXT,
  QuestionType.SELECT_WORD,
  QuestionType.FILL_BLANK,
] as const;

const QUESTION_SKILL_DIMENSIONS: Record<QuestionType, ReviewSkillDimension> = {
  [QuestionType.SELECT_MEANING]: ReviewSkillDimension.RECOGNITION,
  [QuestionType.SELECT_WORD]: ReviewSkillDimension.RECALL,
  [QuestionType.SELECT_CORRECT_CONTEXT]: ReviewSkillDimension.CONTEXT,
  [QuestionType.FILL_BLANK]: ReviewSkillDimension.SPELLING,
};

@Injectable()
export class QuestionSelectionService {
  skillDimensionFor(questionType: QuestionType): ReviewSkillDimension {
    return QUESTION_SKILL_DIMENSIONS[questionType];
  }

  preferredTypes(
    vocabulary: QuestionSelectionVocabulary,
    attempts: RecentQuestionAttempt[],
    excludedType?: QuestionType,
  ): QuestionType[] {
    const recent = attempts.slice(0, RECENT_ACCURACY_WINDOW);
    const accuracy =
      recent.length === 0
        ? null
        : recent.filter(({ isCorrect }) => isCorrect).length / recent.length;
    const hasLowAccuracy =
      recent.length >= MINIMUM_ACCURACY_SAMPLE &&
      accuracy !== null &&
      accuracy < LOW_RECENT_ACCURACY;
    const hasGoodHistory =
      (recent.length >= MINIMUM_ACCURACY_SAMPLE &&
        accuracy !== null &&
        accuracy >= GOOD_RECENT_ACCURACY) ||
      vocabulary.consecutiveCorrectReviews >= 2 ||
      vocabulary.lastReviewScore === 5;

    let preferred: QuestionType[];
    if (vocabulary.learningStatus === LearningStatus.NEW) {
      preferred = [
        QuestionType.SELECT_MEANING,
        QuestionType.SELECT_WORD,
        QuestionType.FILL_BLANK,
        QuestionType.SELECT_CORRECT_CONTEXT,
      ];
    } else if (hasLowAccuracy) {
      preferred = [
        QuestionType.SELECT_CORRECT_CONTEXT,
        QuestionType.SELECT_MEANING,
        QuestionType.SELECT_WORD,
        QuestionType.FILL_BLANK,
      ];
    } else if (vocabulary.learningStatus === LearningStatus.LEARNING) {
      preferred = [
        QuestionType.SELECT_WORD,
        QuestionType.SELECT_MEANING,
        QuestionType.FILL_BLANK,
        QuestionType.SELECT_CORRECT_CONTEXT,
      ];
    } else if (
      vocabulary.learningStatus === LearningStatus.REVIEWING &&
      hasGoodHistory
    ) {
      preferred = [
        QuestionType.FILL_BLANK,
        QuestionType.SELECT_WORD,
        QuestionType.SELECT_MEANING,
        QuestionType.SELECT_CORRECT_CONTEXT,
      ];
    } else {
      preferred = [...ALL_TYPES];
    }

    return excludedType === undefined
      ? preferred
      : preferred.filter((questionType) => questionType !== excludedType);
  }
}
