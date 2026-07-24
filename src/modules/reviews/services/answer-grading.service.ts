import { Injectable } from '@nestjs/common';
import { QuestionType } from '../../../../generated/prisma/enums';

export interface GradingOption {
  id: string;
  optionText: string;
  isCorrect: boolean;
  explanation: string | null;
}

export interface GradingQuestion {
  questionType: QuestionType;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  options: GradingOption[];
}

export interface SubmittedAnswer {
  selectedOptionId?: string;
  userAnswerText?: string;
}

export interface GradingResult {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string | null;
  earnedPoints: number;
  normalizedUserAnswerText: string | null;
  selectedOptionId: string | null;
}

export class InvalidAnswerShapeError extends Error {}
export class InvalidAnswerRelationshipError extends Error {}

const OPTION_BASED_TYPES = new Set<QuestionType>([
  QuestionType.SELECT_MEANING,
  QuestionType.SELECT_WORD,
  QuestionType.SELECT_CORRECT_CONTEXT,
]);

@Injectable()
export class AnswerGradingService {
  grade(question: GradingQuestion, answer: SubmittedAnswer): GradingResult {
    if (OPTION_BASED_TYPES.has(question.questionType)) {
      return this.gradeOption(question, answer);
    }
    if (question.questionType === QuestionType.FILL_BLANK) {
      return this.gradeFillBlank(question, answer);
    }
    throw new InvalidAnswerShapeError('Unsupported question type');
  }

  correctAnswer(question: GradingQuestion): string {
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
  }

  normalizeFillBlank(value: string, isCaseSensitive: boolean): string {
    const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    return isCaseSensitive ? normalized : normalized.toLocaleLowerCase('en-US');
  }

  private gradeOption(
    question: GradingQuestion,
    answer: SubmittedAnswer,
  ): GradingResult {
    if (!answer.selectedOptionId || answer.userAnswerText !== undefined) {
      throw new InvalidAnswerShapeError(
        'Option-based questions require selectedOptionId only',
      );
    }
    const selected = question.options.find(
      ({ id }) => id === answer.selectedOptionId,
    );
    if (!selected) {
      throw new InvalidAnswerRelationshipError(
        'Selected option does not belong to the question',
      );
    }
    return {
      isCorrect: selected.isCorrect,
      correctAnswer: this.correctAnswer(question),
      explanation: question.answerExplanation ?? selected.explanation,
      earnedPoints: selected.isCorrect ? question.points : 0,
      normalizedUserAnswerText: null,
      selectedOptionId: selected.id,
    };
  }

  private gradeFillBlank(
    question: GradingQuestion,
    answer: SubmittedAnswer,
  ): GradingResult {
    if (
      answer.selectedOptionId !== undefined ||
      !answer.userAnswerText?.trim()
    ) {
      throw new InvalidAnswerShapeError(
        'FILL_BLANK questions require userAnswerText only',
      );
    }
    const correctAnswer = this.correctAnswer(question);
    const normalizedUserAnswerText = this.normalizeFillBlank(
      answer.userAnswerText,
      question.isCaseSensitive,
    );
    const normalizedCorrectAnswer = this.normalizeFillBlank(
      correctAnswer,
      question.isCaseSensitive,
    );
    const isCorrect = normalizedUserAnswerText === normalizedCorrectAnswer;

    return {
      isCorrect,
      correctAnswer,
      explanation: question.answerExplanation,
      earnedPoints: isCorrect ? question.points : 0,
      normalizedUserAnswerText,
      selectedOptionId: null,
    };
  }
}
