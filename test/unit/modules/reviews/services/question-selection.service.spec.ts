import {
  LearningStatus,
  QuestionType,
  ReviewGoal,
  ReviewSkillDimension,
} from '../../../../../generated/prisma/enums';
import { QuestionSelectionService } from '../../../../../src/modules/reviews/services/question-selection.service';

describe('QuestionSelectionService', () => {
  const service = new QuestionSelectionService();
  const vocabulary = {
    learningStatus: LearningStatus.LEARNING,
    consecutiveCorrectReviews: 0,
    lastReviewScore: 3,
  };

  it.each([
    [QuestionType.SELECT_MEANING, ReviewSkillDimension.RECOGNITION],
    [QuestionType.SELECT_WORD, ReviewSkillDimension.RECALL],
    [QuestionType.SELECT_CORRECT_CONTEXT, ReviewSkillDimension.CONTEXT],
    [QuestionType.FILL_BLANK, ReviewSkillDimension.SPELLING],
  ])('maps %s to %s deterministically', (questionType, dimension) => {
    expect(service.skillDimensionFor(questionType)).toBe(dimension);
  });

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

  it.each([
    [ReviewGoal.RECALL, QuestionType.SELECT_WORD],
    [ReviewGoal.SPELLING, QuestionType.FILL_BLANK],
    [ReviewGoal.CONTEXT, QuestionType.SELECT_CORRECT_CONTEXT],
  ])('moves the %s goal activity to the front', (goal, questionType) => {
    expect(service.preferredTypes(vocabulary, [], undefined, goal)[0]).toBe(
      questionType,
    );
  });

  it('balances question types across one session instead of repeating the first preference', () => {
    const preferences = Array.from({ length: 8 }, () =>
      service.preferredTypes(
        { ...vocabulary, learningStatus: LearningStatus.NEW },
        [],
      ),
    );

    expect(
      service.selectSessionTypes(preferences, ReviewGoal.BALANCED),
    ).toEqual([
      QuestionType.SELECT_MEANING,
      QuestionType.SELECT_WORD,
      QuestionType.FILL_BLANK,
      QuestionType.SELECT_CORRECT_CONTEXT,
      QuestionType.SELECT_MEANING,
      QuestionType.SELECT_WORD,
      QuestionType.FILL_BLANK,
      QuestionType.SELECT_CORRECT_CONTEXT,
    ]);
  });

  it.each([
    [ReviewGoal.RECALL, QuestionType.SELECT_WORD],
    [ReviewGoal.SPELLING, QuestionType.FILL_BLANK],
    [ReviewGoal.CONTEXT, QuestionType.SELECT_CORRECT_CONTEXT],
  ])(
    'pins every session question to the %s goal type',
    (goal, questionType) => {
      const preferences = Array.from({ length: 4 }, () =>
        service.preferredTypes(vocabulary, [], undefined, goal),
      );

      expect(service.selectSessionTypes(preferences, goal)).toEqual(
        Array.from({ length: 4 }, () => questionType),
      );
    },
  );
});
