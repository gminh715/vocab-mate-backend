import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ArticleStatus,
  QuestionType,
  QuizStatus,
} from '../../../../generated/prisma/enums';
import {
  type QuizLifecycleState,
  type QuizPublicationSnapshot,
  QuizzesRepository,
  QuizStatusTransitionConflictError,
} from '../repositories/quizzes.repository';

export interface QuizPublicationValidationIssue {
  code: string;
  message: string;
  entityId?: string;
}

const optionBasedTypes = new Set<QuestionType>([
  QuestionType.SELECT_MEANING,
  QuestionType.SELECT_WORD,
  QuestionType.SELECT_CORRECT_CONTEXT,
]);

@Injectable()
export class QuizPublicationService {
  constructor(private readonly quizzesRepository: QuizzesRepository) {}

  async publish(actingAdminId: string, quizId: string) {
    const snapshot = await this.requirePublicationSnapshot(quizId);
    if (snapshot.quiz.status !== QuizStatus.DRAFT) {
      throw new ConflictException('Only a draft quiz can be published');
    }

    const issues = this.validateForPublication(snapshot);
    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Quiz failed publication validation',
        issues,
      });
    }

    const publishedAt = new Date();
    try {
      const quiz = await this.quizzesRepository.transitionQuizStatus({
        quizId,
        expectedStatus: QuizStatus.DRAFT,
        status: QuizStatus.PUBLISHED,
        publishedAt,
        requirePublishedArticle: true,
        updatedByUserId: actingAdminId,
      });
      if (!quiz.publishedAt) throw new QuizStatusTransitionConflictError();
      return {
        id: quiz.id,
        status: quiz.status,
        publishedAt: quiz.publishedAt,
      };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  async archive(actingAdminId: string, quizId: string) {
    const state = await this.requireLifecycleState(quizId);
    if (state.status === QuizStatus.ARCHIVED) {
      throw new ConflictException('Quiz is already archived');
    }
    if (
      state.status !== QuizStatus.DRAFT &&
      state.status !== QuizStatus.PUBLISHED
    ) {
      throw new ConflictException('Quiz cannot be archived from this state');
    }

    try {
      const quiz = await this.quizzesRepository.transitionQuizStatus({
        quizId,
        expectedStatus: state.status,
        status: QuizStatus.ARCHIVED,
        updatedByUserId: actingAdminId,
      });
      return { id: quiz.id, status: quiz.status };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  async restoreDraft(actingAdminId: string, quizId: string) {
    const state = await this.requireLifecycleState(quizId);
    if (state.status !== QuizStatus.ARCHIVED) {
      throw new ConflictException('Only an archived quiz can be restored');
    }
    if (state.reviewSessionCount > 0) {
      throw new ConflictException(
        'A quiz with review history cannot be restored',
      );
    }

    try {
      const quiz = await this.quizzesRepository.transitionQuizStatus({
        quizId,
        expectedStatus: QuizStatus.ARCHIVED,
        status: QuizStatus.DRAFT,
        publishedAt: null,
        requireNoReviewSessions: true,
        updatedByUserId: actingAdminId,
      });
      return { id: quiz.id, status: quiz.status };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  validateForPublication(
    snapshot: QuizPublicationSnapshot,
  ): QuizPublicationValidationIssue[] {
    const issues: QuizPublicationValidationIssue[] = [];
    const addIssue = (
      code: string,
      message: string,
      entityId?: string,
    ): void => {
      issues.push({
        code,
        message,
        ...(entityId ? { entityId } : {}),
      });
    };

    if (snapshot.article.status !== ArticleStatus.PUBLISHED) {
      addIssue(
        'ARTICLE_NOT_PUBLISHED',
        'The associated article must be published.',
        snapshot.article.id,
      );
    }
    if (snapshot.questions.length === 0) {
      addIssue(
        'NO_ACTIVE_QUESTIONS',
        'At least one active question is required.',
        snapshot.quiz.id,
      );
    }

    const questionOrders = new Set<number>();
    for (const question of snapshot.questions) {
      if (question.points <= 0) {
        addIssue(
          'QUESTION_POINTS_INVALID',
          'Active question points must be positive.',
          question.id,
        );
      }
      if (!question.prompt.trim()) {
        addIssue(
          'QUESTION_PROMPT_BLANK',
          'Active question prompts must not be blank.',
          question.id,
        );
      }
      if (
        question.displayOrder <= 0 ||
        questionOrders.has(question.displayOrder)
      ) {
        addIssue(
          'QUESTION_DISPLAY_ORDER_INVALID',
          'Active question display orders must be positive and unique.',
          question.id,
        );
      }
      questionOrders.add(question.displayOrder);

      const term = question.articleVocabulary;
      if (term.sentence.articleId !== snapshot.quiz.articleId) {
        addIssue(
          'QUESTION_TERM_WRONG_ARTICLE',
          'The question term must belong to the quiz article.',
          question.id,
        );
      }
      if (
        !term.isActive ||
        !term.sentence.isActive ||
        term.sentence.contentVersion !== snapshot.article.contentVersion
      ) {
        addIssue(
          'QUESTION_TERM_NOT_CURRENT_ACTIVE',
          'The question term must be active in the current article version.',
          question.id,
        );
      }

      if (question.questionType === QuestionType.FILL_BLANK) {
        if (!question.blankSentence?.trim()) {
          addIssue(
            'FILL_BLANK_SENTENCE_MISSING',
            'FILL_BLANK questions require a nonblank blank sentence.',
            question.id,
          );
        }
        if (!question.correctAnswerText?.trim()) {
          addIssue(
            'FILL_BLANK_ANSWER_MISSING',
            'FILL_BLANK questions require a nonblank correct answer.',
            question.id,
          );
        }
        if (question.options.length > 0) {
          addIssue(
            'FILL_BLANK_HAS_OPTIONS',
            'FILL_BLANK questions cannot have options.',
            question.id,
          );
        }
        continue;
      }

      if (!optionBasedTypes.has(question.questionType)) {
        addIssue(
          'QUESTION_TYPE_UNSUPPORTED',
          'The active question type is not supported.',
          question.id,
        );
        continue;
      }
      if (question.options.length < 2) {
        addIssue(
          'OPTION_COUNT_INVALID',
          'Option-based questions require at least two options.',
          question.id,
        );
      }
      if (question.options.filter((option) => option.isCorrect).length !== 1) {
        addIssue(
          'CORRECT_OPTION_COUNT_INVALID',
          'Option-based questions require exactly one correct option.',
          question.id,
        );
      }
      const optionOrders = new Set<number>();
      for (const option of question.options) {
        if (!option.optionText.trim()) {
          addIssue(
            'OPTION_TEXT_BLANK',
            'Question options must not be blank.',
            option.id,
          );
        }
        if (option.displayOrder <= 0 || optionOrders.has(option.displayOrder)) {
          addIssue(
            'OPTION_DISPLAY_ORDER_INVALID',
            'Option display orders must be positive and unique per question.',
            option.id,
          );
        }
        optionOrders.add(option.displayOrder);
      }
    }

    return issues;
  }

  private async requirePublicationSnapshot(
    quizId: string,
  ): Promise<QuizPublicationSnapshot> {
    const snapshot =
      await this.quizzesRepository.findPublicationSnapshot(quizId);
    if (!snapshot) throw new NotFoundException('Quiz not found');
    return snapshot;
  }

  private async requireLifecycleState(
    quizId: string,
  ): Promise<QuizLifecycleState> {
    const state = await this.quizzesRepository.findQuizLifecycleState(quizId);
    if (!state) throw new NotFoundException('Quiz not found');
    return state;
  }

  private mapTransitionError(error: unknown): never {
    if (error instanceof QuizStatusTransitionConflictError) {
      throw new ConflictException('Quiz state changed; retry the request');
    }
    throw error;
  }
}
