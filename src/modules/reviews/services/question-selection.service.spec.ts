import {
  LearningStatus,
  QuestionType,
} from '../../../../generated/prisma/enums';
import { QuestionSelectionService } from './question-selection.service';

describe('QuestionSelectionService', () => {
  const service = new QuestionSelectionService();
  const vocabulary = {
    learningStatus: LearningStatus.LEARNING,
    consecutiveCorrectReviews: 0,
    lastReviewScore: 3,
  };

  it('prefers SELECT_MEANING for NEW vocabulary', () => {
    expect(
      service.preferredTypes(
        { ...vocabulary, learningStatus: LearningStatus.NEW },
        [],
      )[0],
    ).toBe(QuestionType.SELECT_MEANING);
  });

  it('prefers SELECT_CORRECT_CONTEXT when recent accuracy is low', () => {
    expect(
      service.preferredTypes(vocabulary, [
        { questionType: QuestionType.SELECT_WORD, isCorrect: false },
        { questionType: QuestionType.SELECT_MEANING, isCorrect: true },
        { questionType: QuestionType.FILL_BLANK, isCorrect: false },
      ])[0],
    ).toBe(QuestionType.SELECT_CORRECT_CONTEXT);
  });

  it('prefers SELECT_WORD for stable LEARNING vocabulary', () => {
    expect(
      service.preferredTypes(vocabulary, [
        { questionType: QuestionType.SELECT_MEANING, isCorrect: true },
        { questionType: QuestionType.SELECT_WORD, isCorrect: true },
      ])[0],
    ).toBe(QuestionType.SELECT_WORD);
  });

  it('prefers FILL_BLANK for REVIEWING vocabulary with good history', () => {
    expect(
      service.preferredTypes(
        { ...vocabulary, learningStatus: LearningStatus.REVIEWING },
        [
          { questionType: QuestionType.SELECT_MEANING, isCorrect: true },
          { questionType: QuestionType.SELECT_WORD, isCorrect: true },
          {
            questionType: QuestionType.SELECT_CORRECT_CONTEXT,
            isCorrect: true,
          },
        ],
      )[0],
    ).toBe(QuestionType.FILL_BLANK);
  });

  it('always excludes the failed question type for a retry', () => {
    const types = service.preferredTypes(
      { ...vocabulary, learningStatus: LearningStatus.NEW },
      [],
      QuestionType.SELECT_MEANING,
    );
    expect(types).not.toContain(QuestionType.SELECT_MEANING);
    expect(types).toHaveLength(3);
  });
});
