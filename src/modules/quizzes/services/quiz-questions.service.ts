import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QuestionType, QuizStatus } from '../../../../generated/prisma/enums';
import type {
  CreateQuestionOptionDto,
  CreateQuizQuestionDto,
  UpdateQuestionOptionDto,
  UpdateQuizQuestionDto,
} from '../dto/quiz-question-request.dto';
import {
  type AdminQuestionOptionRecord,
  type AdminQuizQuestionRecord,
  type QuestionMutationState,
  type QuizContentState,
  QuizContentMutationConflictError,
  QuizHistoryReferenceError,
  QuizOwnedRecordNotFoundError,
  QuizQuestionTypeConflictError,
  QuizzesRepository,
  QuizSourceTermStateConflictError,
} from '../repositories/quizzes.repository';

const optionBasedTypes = new Set<QuestionType>([
  QuestionType.SELECT_MEANING,
  QuestionType.SELECT_WORD,
  QuestionType.SELECT_CORRECT_CONTEXT,
]);

const hasPrismaCode = (
  error: unknown,
  code: 'P2002' | 'P2003' | 'P2025' | 'P2034',
): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

interface QuestionShape {
  articleVocabularyId: string;
  questionType: QuestionType;
  prompt: string;
  blankSentence: string | null;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  displayOrder: number;
  isActive: boolean;
}

@Injectable()
export class QuizQuestionsService {
  constructor(private readonly quizzesRepository: QuizzesRepository) {}

  async createQuestion(
    actingAdminId: string,
    quizId: string,
    dto: CreateQuizQuestionDto,
  ): Promise<{ question: AdminQuizQuestionRecord }> {
    const quiz = await this.requireEditableQuiz(quizId);
    await this.requireOwnedCurrentTerm(quiz, dto.articleVocabularyId);
    const shape: QuestionShape = {
      articleVocabularyId: dto.articleVocabularyId,
      questionType: dto.questionType,
      prompt: dto.prompt.trim(),
      blankSentence: dto.blankSentence?.trim() ?? null,
      correctAnswerText: dto.correctAnswerText?.trim() ?? null,
      answerExplanation: dto.answerExplanation?.trim() ?? null,
      isCaseSensitive: dto.isCaseSensitive ?? false,
      points: dto.points ?? 1,
      displayOrder: dto.displayOrder ?? 1,
      isActive: dto.isActive ?? true,
    };
    this.validateQuestionShape(shape, 0);

    try {
      const question = await this.quizzesRepository.createQuestion(quizId, {
        ...shape,
        createdByUserId: actingAdminId,
        updatedByUserId: actingAdminId,
      });
      return { question };
    } catch (error: unknown) {
      this.mapMutationError(error);
    }
  }

  async findQuestion(quizId: string, questionId: string) {
    const detail = await this.quizzesRepository.findQuestionDetail(
      quizId,
      questionId,
    );
    if (!detail) throw new NotFoundException('Quiz question not found');
    return detail;
  }

  async updateQuestion(
    actingAdminId: string,
    quizId: string,
    questionId: string,
    dto: UpdateQuizQuestionDto,
  ): Promise<{ question: AdminQuizQuestionRecord }> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one question field is required');
    }
    const quiz = await this.requireEditableQuiz(quizId);
    const current = await this.requireOwnedQuestion(quizId, questionId);
    if (
      dto.articleVocabularyId !== undefined &&
      dto.articleVocabularyId !== current.articleVocabularyId
    ) {
      await this.requireOwnedCurrentTerm(quiz, dto.articleVocabularyId);
    }

    const shape = this.mergeQuestion(current, dto);
    this.validateQuestionShape(shape, current.options.length);
    const switchingFromFillBlank =
      current.questionType === QuestionType.FILL_BLANK &&
      shape.questionType !== QuestionType.FILL_BLANK;

    try {
      const question = await this.quizzesRepository.updateQuestion(
        quizId,
        questionId,
        {
          ...(dto.articleVocabularyId === undefined
            ? {}
            : { articleVocabularyId: shape.articleVocabularyId }),
          ...(dto.questionType === undefined
            ? {}
            : { questionType: shape.questionType }),
          ...(dto.prompt === undefined ? {} : { prompt: shape.prompt }),
          ...(dto.blankSentence === undefined && !switchingFromFillBlank
            ? {}
            : { blankSentence: shape.blankSentence }),
          ...(dto.correctAnswerText === undefined && !switchingFromFillBlank
            ? {}
            : { correctAnswerText: shape.correctAnswerText }),
          ...(dto.answerExplanation === undefined
            ? {}
            : { answerExplanation: shape.answerExplanation }),
          ...(dto.isCaseSensitive === undefined
            ? {}
            : { isCaseSensitive: shape.isCaseSensitive }),
          ...(dto.points === undefined ? {} : { points: shape.points }),
          ...(dto.displayOrder === undefined
            ? {}
            : { displayOrder: shape.displayOrder }),
          ...(dto.isActive === undefined ? {} : { isActive: shape.isActive }),
          updatedByUserId: actingAdminId,
        },
      );
      return { question };
    } catch (error: unknown) {
      this.mapMutationError(error);
    }
  }

  async deleteQuestion(
    actingAdminId: string,
    quizId: string,
    questionId: string,
  ): Promise<void> {
    void actingAdminId;
    await this.requireEditableQuiz(quizId);
    const question = await this.requireOwnedQuestion(quizId, questionId);
    if (question.reviewAnswerCount > 0) {
      throw new ConflictException(
        'Quiz question has review history and cannot be deleted',
      );
    }

    try {
      await this.quizzesRepository.deleteQuestion(quizId, questionId);
    } catch (error: unknown) {
      this.mapMutationError(error);
    }
  }

  async createOption(
    actingAdminId: string,
    quizId: string,
    questionId: string,
    dto: CreateQuestionOptionDto,
  ): Promise<{ option: AdminQuestionOptionRecord }> {
    void actingAdminId;
    await this.requireEditableQuiz(quizId);
    const question = await this.requireOwnedQuestion(quizId, questionId);
    this.requireOptionBasedQuestion(question.questionType);

    try {
      const option = await this.quizzesRepository.createOption(
        quizId,
        questionId,
        {
          optionText: dto.optionText.trim(),
          isCorrect: dto.isCorrect ?? false,
          explanation: dto.explanation?.trim() ?? null,
          displayOrder: dto.displayOrder ?? 1,
        },
      );
      return { option };
    } catch (error: unknown) {
      this.mapMutationError(error);
    }
  }

  async updateOption(
    actingAdminId: string,
    quizId: string,
    questionId: string,
    optionId: string,
    dto: UpdateQuestionOptionDto,
  ): Promise<{ option: AdminQuestionOptionRecord }> {
    void actingAdminId;
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one option field is required');
    }
    await this.requireEditableQuiz(quizId);
    const context = await this.quizzesRepository.findOptionForMutation(
      quizId,
      questionId,
      optionId,
    );
    if (!context) throw new NotFoundException('Question option not found');
    this.requireOptionBasedQuestion(context.question.questionType);

    try {
      const option = await this.quizzesRepository.updateOption(
        quizId,
        questionId,
        optionId,
        {
          ...(dto.optionText === undefined
            ? {}
            : { optionText: dto.optionText.trim() }),
          ...(dto.isCorrect === undefined ? {} : { isCorrect: dto.isCorrect }),
          ...(dto.explanation === undefined
            ? {}
            : { explanation: dto.explanation?.trim() ?? null }),
          ...(dto.displayOrder === undefined
            ? {}
            : { displayOrder: dto.displayOrder }),
        },
      );
      return { option };
    } catch (error: unknown) {
      this.mapMutationError(error);
    }
  }

  async deleteOption(
    actingAdminId: string,
    quizId: string,
    questionId: string,
    optionId: string,
  ): Promise<void> {
    void actingAdminId;
    await this.requireEditableQuiz(quizId);
    const context = await this.quizzesRepository.findOptionForMutation(
      quizId,
      questionId,
      optionId,
    );
    if (!context) throw new NotFoundException('Question option not found');
    this.requireOptionBasedQuestion(context.question.questionType);
    if (context.reviewAnswerCount > 0) {
      throw new ConflictException(
        'Question option has review history and cannot be deleted',
      );
    }

    try {
      await this.quizzesRepository.deleteOption(quizId, questionId, optionId);
    } catch (error: unknown) {
      this.mapMutationError(error);
    }
  }

  private async requireEditableQuiz(quizId: string): Promise<QuizContentState> {
    const quiz = await this.quizzesRepository.findQuizContentState(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== QuizStatus.DRAFT || quiz.reviewSessionCount > 0) {
      throw new ConflictException(
        'Quiz content cannot be changed after publication or usage',
      );
    }
    return quiz;
  }

  private async requireOwnedCurrentTerm(
    quiz: QuizContentState,
    articleVocabularyId: string,
  ): Promise<void> {
    const term =
      await this.quizzesRepository.findQuestionSourceTerm(articleVocabularyId);
    if (!term) {
      throw new NotFoundException('Article vocabulary term not found');
    }
    if (term.sentence.articleId !== quiz.articleId) {
      throw new UnprocessableEntityException(
        'Article vocabulary term does not belong to the quiz article',
      );
    }
    if (
      !term.isActive ||
      !term.sentence.isActive ||
      term.sentence.contentVersion !== quiz.articleContentVersion
    ) {
      throw new UnprocessableEntityException(
        'Article vocabulary term is not active in the current article version',
      );
    }
  }

  private async requireOwnedQuestion(
    quizId: string,
    questionId: string,
  ): Promise<QuestionMutationState> {
    const question = await this.quizzesRepository.findQuestionForMutation(
      quizId,
      questionId,
    );
    if (!question) throw new NotFoundException('Quiz question not found');
    return question;
  }

  private mergeQuestion(
    current: QuestionMutationState,
    dto: UpdateQuizQuestionDto,
  ): QuestionShape {
    const questionType = dto.questionType ?? current.questionType;
    const switchingFromFillBlank =
      current.questionType === QuestionType.FILL_BLANK &&
      questionType !== QuestionType.FILL_BLANK;
    return {
      articleVocabularyId:
        dto.articleVocabularyId ?? current.articleVocabularyId,
      questionType,
      prompt: dto.prompt?.trim() ?? current.prompt,
      blankSentence:
        dto.blankSentence !== undefined
          ? (dto.blankSentence?.trim() ?? null)
          : switchingFromFillBlank
            ? null
            : current.blankSentence,
      correctAnswerText:
        dto.correctAnswerText !== undefined
          ? (dto.correctAnswerText?.trim() ?? null)
          : switchingFromFillBlank
            ? null
            : current.correctAnswerText,
      answerExplanation:
        dto.answerExplanation !== undefined
          ? (dto.answerExplanation?.trim() ?? null)
          : current.answerExplanation,
      isCaseSensitive: dto.isCaseSensitive ?? current.isCaseSensitive,
      points: dto.points ?? current.points,
      displayOrder: dto.displayOrder ?? current.displayOrder,
      isActive: dto.isActive ?? current.isActive,
    };
  }

  private validateQuestionShape(
    question: QuestionShape,
    optionCount: number,
  ): void {
    if (!question.prompt.trim()) {
      throw new BadRequestException('Question prompt must not be blank');
    }
    if (question.questionType === QuestionType.FILL_BLANK) {
      if (!question.blankSentence?.trim()) {
        throw new BadRequestException(
          'FILL_BLANK questions require a nonblank blankSentence',
        );
      }
      if (!question.correctAnswerText?.trim()) {
        throw new BadRequestException(
          'FILL_BLANK questions require a nonblank correctAnswerText',
        );
      }
      if (optionCount > 0) {
        throw new BadRequestException(
          'Remove all options before changing a question to FILL_BLANK',
        );
      }
      return;
    }
    if (!optionBasedTypes.has(question.questionType)) {
      throw new BadRequestException('Unsupported question type');
    }
    if (
      question.blankSentence !== null ||
      question.correctAnswerText !== null
    ) {
      throw new BadRequestException(
        'Option-based questions cannot contain fill-blank answer fields',
      );
    }
  }

  private requireOptionBasedQuestion(questionType: QuestionType): void {
    if (!optionBasedTypes.has(questionType)) {
      throw new ConflictException('FILL_BLANK questions cannot have options');
    }
  }

  private mapMutationError(error: unknown): never {
    if (
      error instanceof QuizContentMutationConflictError ||
      error instanceof QuizHistoryReferenceError ||
      error instanceof QuizQuestionTypeConflictError ||
      hasPrismaCode(error, 'P2003') ||
      hasPrismaCode(error, 'P2034')
    ) {
      throw new ConflictException('Quiz content mutation is not allowed');
    }
    if (
      error instanceof QuizOwnedRecordNotFoundError ||
      hasPrismaCode(error, 'P2025')
    ) {
      throw new NotFoundException('Quiz question or option not found');
    }
    if (error instanceof QuizSourceTermStateConflictError) {
      throw new UnprocessableEntityException(
        'Article vocabulary term is no longer valid for this quiz',
      );
    }
    if (hasPrismaCode(error, 'P2002')) {
      throw new ConflictException('Display order is already in use');
    }
    throw error;
  }
}
