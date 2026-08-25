import { QuestionType } from '../../../generated/prisma/enums';
import { InvalidAnswerShapeError } from './repositories/review-errors';

/** Shared question-display rule used by grading and completed-session results. */
export const correctAnswerFor = (question: {
  questionType: QuestionType;
  correctAnswerText: string | null;
  options: Array<{ optionText: string; isCorrect: boolean }>;
}): string => {
  if (question.questionType === QuestionType.FILL_BLANK) {
    if (!question.correctAnswerText) {
      throw new InvalidAnswerShapeError(
        'FILL_BLANK question has no correct answer',
      );
    }
    return question.correctAnswerText;
  }
  return question.options
    .filter(({ isCorrect }) => isCorrect)
    .map(({ optionText }) => optionText)
    .join(', ');
};
