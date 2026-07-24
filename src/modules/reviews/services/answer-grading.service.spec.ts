import { QuestionType } from '../../../../generated/prisma/enums';
import {
  AnswerGradingService,
  InvalidAnswerRelationshipError,
  InvalidAnswerShapeError,
  type GradingQuestion,
} from './answer-grading.service';

const optionQuestion = (questionType: QuestionType): GradingQuestion => ({
  questionType,
  correctAnswerText: null,
  answerExplanation: 'Because it matches.',
  isCaseSensitive: false,
  points: 3,
  options: [
    { id: 'wrong', optionText: 'Wrong', isCorrect: false, explanation: null },
    { id: 'right', optionText: 'Right', isCorrect: true, explanation: null },
  ],
});

describe('AnswerGradingService', () => {
  const service = new AnswerGradingService();

  it.each([
    QuestionType.SELECT_MEANING,
    QuestionType.SELECT_WORD,
    QuestionType.SELECT_CORRECT_CONTEXT,
  ])('grades correct and incorrect %s options', (questionType) => {
    expect(
      service.grade(optionQuestion(questionType), {
        selectedOptionId: 'right',
      }),
    ).toMatchObject({
      isCorrect: true,
      correctAnswer: 'Right',
      earnedPoints: 3,
    });
    expect(
      service.grade(optionQuestion(questionType), {
        selectedOptionId: 'wrong',
      }),
    ).toMatchObject({ isCorrect: false, earnedPoints: 0 });
  });

  it('rejects option ownership and mutually exclusive answer fields', () => {
    expect(() =>
      service.grade(optionQuestion(QuestionType.SELECT_WORD), {
        selectedOptionId: 'foreign',
      }),
    ).toThrow(InvalidAnswerRelationshipError);
    expect(() =>
      service.grade(optionQuestion(QuestionType.SELECT_WORD), {
        selectedOptionId: 'right',
        userAnswerText: 'Right',
      }),
    ).toThrow(InvalidAnswerShapeError);
  });

  it('uses NFKC, trims and collapses whitespace case-insensitively', () => {
    const question: GradingQuestion = {
      questionType: QuestionType.FILL_BLANK,
      correctAnswerText: 'Hello World',
      answerExplanation: null,
      isCaseSensitive: false,
      points: 2,
      options: [],
    };

    expect(
      service.grade(question, { userAnswerText: '  ＨＥＬＬＯ   world  ' }),
    ).toMatchObject({
      isCorrect: true,
      normalizedUserAnswerText: 'hello world',
      earnedPoints: 2,
    });
  });

  it('preserves accents and punctuation and honors case sensitivity', () => {
    const question: GradingQuestion = {
      questionType: QuestionType.FILL_BLANK,
      correctAnswerText: 'Café!',
      answerExplanation: null,
      isCaseSensitive: true,
      points: 1,
      options: [],
    };
    expect(service.grade(question, { userAnswerText: 'Café!' }).isCorrect).toBe(
      true,
    );
    expect(service.grade(question, { userAnswerText: 'cafe!' }).isCorrect).toBe(
      false,
    );
    expect(() =>
      service.grade(question, { selectedOptionId: 'option' }),
    ).toThrow(InvalidAnswerShapeError);
  });
});
