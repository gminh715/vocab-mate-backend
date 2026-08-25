import { Injectable } from '@nestjs/common';
import {
  QuestionType,
  ReviewGoal,
  ReviewSkillDimension,
} from '../../../../generated/prisma/enums';
import {
  preferredQuestionTypes,
  selectSessionQuestionTypes,
  skillDimensionForQuestion,
  type QuestionSelectionVocabulary,
  type RecentQuestionAttempt,
} from './question-selection';

export * from './question-selection';

@Injectable()
export class QuestionSelectionService {
  skillDimensionFor(questionType: QuestionType): ReviewSkillDimension {
    return skillDimensionForQuestion(questionType);
  }

  preferredTypes(
    vocabulary: QuestionSelectionVocabulary,
    attempts: RecentQuestionAttempt[],
    excludedType?: QuestionType,
    reviewGoal?: ReviewGoal,
  ): QuestionType[] {
    return preferredQuestionTypes(
      vocabulary,
      attempts,
      excludedType,
      reviewGoal,
    );
  }

  selectSessionTypes(
    preferences: QuestionType[][],
    reviewGoal?: ReviewGoal,
  ): QuestionType[] {
    return selectSessionQuestionTypes(preferences, reviewGoal);
  }
}
