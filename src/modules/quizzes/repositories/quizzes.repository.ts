import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  ArticleStatus,
  QuestionType,
  QuestionGenerationSource,
  QuizStatus,
  type CefrLevel,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';

export interface QuizRecord {
  id: string;
  articleId: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  publishedAt: Date | null;
}

export interface AdminQuizRecord extends QuizRecord {
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicQuizArticleRecord {
  id: string;
  title: string;
  slug: string;
  summary: string;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  cefrLevel: CefrLevel;
  status: ArticleStatus;
  publishedAt: Date | null;
}

export interface PublicQuizDetailBase {
  quiz: QuizRecord;
  article: PublicQuizArticleRecord;
}

export interface ActiveQuestionAggregate {
  questionCount: number;
  totalPoints: number;
}

export interface AdminQuestionOptionRecord {
  id: string;
  quizQuestionId: string;
  optionText: string;
  isCorrect: boolean;
  generationSource: QuestionGenerationSource;
  explanation: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminQuizQuestionBaseRecord {
  id: string;
  quizId: string | null;
  articleSentenceTermId: string;
  questionType: QuestionType;
  generationSource: QuestionGenerationSource;
  difficultyCefr: CefrLevel;
  prompt: string;
  blankSentence: string | null;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminQuizQuestionRecord extends AdminQuizQuestionBaseRecord {
  options: AdminQuestionOptionRecord[];
}

export interface AdminQuizDetailRecord {
  quiz: AdminQuizRecord;
  questions: AdminQuizQuestionRecord[];
}

export interface FindQuizListQuery {
  page: number;
  limit: number;
  q?: string;
  articleId?: string;
}

export interface FindAdminQuizListQuery extends FindQuizListQuery {
  status?: QuizStatus;
}

export interface QuizListResult<T> {
  items: T[];
  total: number;
}

export interface AdminQuizListRecord extends AdminQuizRecord {
  questionCount: number;
}

export interface CreateQuizInput {
  articleId: string;
  title: string;
  description?: string;
  createdByUserId: string;
  updatedByUserId: string;
}

export interface UpdateQuizInput {
  title?: string;
  description?: string;
  updatedByUserId: string;
}

export interface QuizMutationState {
  id: string;
  status: QuizStatus;
}

export interface ArticleQuizCreationState {
  id: string;
  status: ArticleStatus;
}

export interface QuizDeleteSafetyRecord extends QuizMutationState {
  reviewSessionCount: number;
}

export interface QuizContentState extends QuizMutationState {
  articleId: string;
  articleContentVersion: number;
  reviewSessionCount: number;
}

export interface QuizLifecycleState extends QuizMutationState {
  publishedAt: Date | null;
  reviewSessionCount: number;
}

export interface QuizPublicationOptionRecord {
  id: string;
  optionText: string;
  isCorrect: boolean;
  displayOrder: number;
}

export interface QuizPublicationQuestionRecord {
  id: string;
  questionType: QuestionType;
  prompt: string;
  blankSentence: string | null;
  correctAnswerText: string | null;
  points: number;
  displayOrder: number;
  articleSentenceTerm: {
    isActive: boolean;
    sentence: {
      articleId: string;
      contentVersion: number;
      isActive: boolean;
    };
  };
  options: QuizPublicationOptionRecord[];
}

export interface QuizPublicationSnapshot {
  quiz: {
    id: string;
    articleId: string;
    status: QuizStatus;
    publishedAt: Date | null;
  };
  article: {
    id: string;
    status: ArticleStatus;
    contentVersion: number;
  };
  questions: QuizPublicationQuestionRecord[];
}

export interface QuizStatusTransitionInput {
  quizId: string;
  expectedStatus: QuizStatus;
  status: QuizStatus;
  publishedAt?: Date | null;
  requirePublishedArticle?: boolean;
  requireNoReviewSessions?: boolean;
  updatedByUserId: string;
}

export interface QuizStatusTransitionRecord {
  id: string;
  status: QuizStatus;
  publishedAt: Date | null;
}

export interface QuestionSourceTermState {
  id: string;
  isActive: boolean;
  cefrLevel: CefrLevel | null;
  sentence: {
    articleId: string;
    contentVersion: number;
    isActive: boolean;
    article: { cefrLevel: CefrLevel };
  };
}

export interface QuestionMutationState extends AdminQuizQuestionRecord {
  reviewAnswerCount: number;
}

export interface OptionMutationState {
  question: AdminQuizQuestionBaseRecord;
  option: AdminQuestionOptionRecord;
  reviewAnswerCount: number;
}

export interface CreateQuizQuestionInput {
  articleSentenceTermId: string;
  questionType: QuestionType;
  generationSource: QuestionGenerationSource;
  difficultyCefr: CefrLevel;
  prompt: string;
  blankSentence: string | null;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  displayOrder: number;
  isActive: boolean;
  createdByUserId: string;
  updatedByUserId: string;
}

export interface UpdateQuizQuestionInput {
  articleSentenceTermId?: string;
  questionType?: QuestionType;
  prompt?: string;
  blankSentence?: string | null;
  correctAnswerText?: string | null;
  answerExplanation?: string | null;
  isCaseSensitive?: boolean;
  points?: number;
  displayOrder?: number;
  isActive?: boolean;
  updatedByUserId: string;
}

export interface CreateQuestionOptionInput {
  optionText: string;
  isCorrect: boolean;
  explanation: string | null;
  displayOrder: number;
}

export interface UpdateQuestionOptionInput {
  optionText?: string;
  isCorrect?: boolean;
  explanation?: string | null;
  displayOrder?: number;
}

export class QuizContentMutationConflictError extends Error {}
export class QuizOwnedRecordNotFoundError extends Error {}
export class QuizSourceTermStateConflictError extends Error {}
export class QuizQuestionTypeConflictError extends Error {}
export class QuizHistoryReferenceError extends Error {}
export class QuizStatusTransitionConflictError extends Error {}

interface EditableQuizTransactionState {
  articleId: string;
  articleContentVersion: number;
}

const quizSelect = {
  id: true,
  articleId: true,
  title: true,
  description: true,
  status: true,
  publishedAt: true,
} as const;

const adminQuizSelect = {
  ...quizSelect,
  createdAt: true,
  updatedAt: true,
} as const;

const publicQuizArticleSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  sourceName: true,
  sourceUrl: true,
  authorName: true,
  thumbnailUrl: true,
  cefrLevel: true,
  status: true,
  publishedAt: true,
} as const;

const adminOptionSelect = {
  id: true,
  quizQuestionId: true,
  optionText: true,
  isCorrect: true,
  generationSource: true,
  explanation: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

const adminQuestionSelect = {
  id: true,
  quizId: true,
  articleSentenceTermId: true,
  questionType: true,
  generationSource: true,
  difficultyCefr: true,
  prompt: true,
  blankSentence: true,
  correctAnswerText: true,
  answerExplanation: true,
  isCaseSensitive: true,
  points: true,
  displayOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  options: {
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: adminOptionSelect,
  },
} satisfies Prisma.QuizQuestionSelect;

const quizStatusTransitionSelect = {
  id: true,
  status: true,
  publishedAt: true,
} as const;

@Injectable()
export class QuizzesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPublished(
    query: FindQuizListQuery,
  ): Promise<QuizListResult<QuizRecord>> {
    const where: Prisma.QuizWhereInput = {
      status: QuizStatus.PUBLISHED,
      article: { is: { status: ArticleStatus.PUBLISHED } },
      ...(query.articleId ? { articleId: query.articleId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quiz.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        select: quizSelect,
      }),
      this.prisma.quiz.count({ where }),
    ]);

    return { items, total };
  }

  async findPublishedDetail(
    quizId: string,
  ): Promise<PublicQuizDetailBase | null> {
    const result = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        status: QuizStatus.PUBLISHED,
        article: { is: { status: ArticleStatus.PUBLISHED } },
      },
      select: {
        ...quizSelect,
        article: { select: publicQuizArticleSelect },
      },
    });
    if (!result) return null;

    const { article, ...quiz } = result;
    return { quiz, article };
  }

  async aggregateActiveQuestions(
    quizId: string,
  ): Promise<ActiveQuestionAggregate> {
    const result = await this.prisma.quizQuestion.aggregate({
      where: { quizId, isActive: true },
      _count: { _all: true },
      _sum: { points: true },
    });

    return {
      questionCount: result._count._all,
      totalPoints: result._sum.points ?? 0,
    };
  }

  async findAdmin(
    query: FindAdminQuizListQuery,
  ): Promise<QuizListResult<AdminQuizListRecord>> {
    const where: Prisma.QuizWhereInput = {
      ...(query.articleId ? { articleId: query.articleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.quiz.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          ...adminQuizSelect,
          _count: {
            select: { questions: { where: { isActive: true } } },
          },
        },
      }),
      this.prisma.quiz.count({ where }),
    ]);
    const items = rows.map(({ _count, ...quiz }) => ({
      ...quiz,
      questionCount: _count.questions,
    }));

    return { items, total };
  }

  async findAdminDetail(quizId: string): Promise<AdminQuizDetailRecord | null> {
    const result = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        ...adminQuizSelect,
        questions: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: adminQuestionSelect,
        },
      },
    });
    if (!result) return null;

    const { questions, ...quiz } = result;
    return { quiz, questions };
  }

  findArticleForCreation(
    articleId: string,
  ): Promise<ArticleQuizCreationState | null> {
    return this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true },
    });
  }

  create(input: CreateQuizInput): Promise<AdminQuizRecord> {
    return this.prisma.quiz.create({
      data: {
        articleId: input.articleId,
        title: input.title,
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        status: QuizStatus.DRAFT,
        publishedAt: null,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.updatedByUserId,
      },
      select: adminQuizSelect,
    });
  }

  findMutationState(quizId: string): Promise<QuizMutationState | null> {
    return this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, status: true },
    });
  }

  update(quizId: string, input: UpdateQuizInput): Promise<AdminQuizRecord> {
    return this.prisma.quiz.update({
      where: { id: quizId },
      data: input,
      select: adminQuizSelect,
    });
  }

  async findDeleteSafety(
    quizId: string,
  ): Promise<QuizDeleteSafetyRecord | null> {
    const result = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        status: true,
        _count: { select: { reviewSessions: true } },
      },
    });
    if (!result) return null;

    return {
      id: result.id,
      status: result.status,
      reviewSessionCount: result._count.reviewSessions,
    };
  }

  async deleteUnusedDraft(quizId: string): Promise<boolean> {
    const result = await this.prisma.quiz.deleteMany({
      where: {
        id: quizId,
        status: QuizStatus.DRAFT,
        reviewSessions: { none: {} },
      },
    });

    return result.count === 1;
  }

  async findQuizContentState(quizId: string): Promise<QuizContentState | null> {
    const result = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        articleId: true,
        status: true,
        article: { select: { contentVersion: true } },
        _count: { select: { reviewSessions: true } },
      },
    });
    if (!result) return null;

    return {
      id: result.id,
      articleId: result.articleId,
      articleContentVersion: result.article.contentVersion,
      status: result.status,
      reviewSessionCount: result._count.reviewSessions,
    };
  }

  async findQuizLifecycleState(
    quizId: string,
  ): Promise<QuizLifecycleState | null> {
    const result = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        ...quizStatusTransitionSelect,
        _count: { select: { reviewSessions: true } },
      },
    });
    if (!result) return null;

    const { _count, ...quiz } = result;
    return {
      ...quiz,
      reviewSessionCount: _count.reviewSessions,
    };
  }

  async findPublicationSnapshot(
    quizId: string,
  ): Promise<QuizPublicationSnapshot | null> {
    const result = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        articleId: true,
        status: true,
        publishedAt: true,
        article: {
          select: {
            id: true,
            status: true,
            contentVersion: true,
          },
        },
        questions: {
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            questionType: true,
            prompt: true,
            blankSentence: true,
            correctAnswerText: true,
            points: true,
            displayOrder: true,
            articleSentenceTerm: {
              select: {
                isActive: true,
                sentence: {
                  select: {
                    articleId: true,
                    contentVersion: true,
                    isActive: true,
                  },
                },
              },
            },
            options: {
              orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                optionText: true,
                isCorrect: true,
                displayOrder: true,
              },
            },
          },
        },
      },
    });
    if (!result) return null;

    const { article, questions, ...quiz } = result;
    return { quiz, article, questions };
  }

  transitionQuizStatus(
    input: QuizStatusTransitionInput,
  ): Promise<QuizStatusTransitionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.quiz.updateMany({
        where: {
          id: input.quizId,
          status: input.expectedStatus,
          ...(input.requirePublishedArticle
            ? { article: { is: { status: ArticleStatus.PUBLISHED } } }
            : {}),
          ...(input.requireNoReviewSessions
            ? { reviewSessions: { none: {} } }
            : {}),
        },
        data: {
          status: input.status,
          ...(input.publishedAt === undefined
            ? {}
            : { publishedAt: input.publishedAt }),
          updatedByUserId: input.updatedByUserId,
        },
      });
      if (updated.count !== 1) {
        throw new QuizStatusTransitionConflictError();
      }
      const quiz = await tx.quiz.findUnique({
        where: { id: input.quizId },
        select: quizStatusTransitionSelect,
      });
      if (!quiz) throw new QuizStatusTransitionConflictError();
      return quiz;
    });
  }

  async findQuestionSourceTerm(
    articleSentenceTermId: string,
  ): Promise<QuestionSourceTermState | null> {
    return this.prisma.articleSentenceTerm.findUnique({
      where: { id: articleSentenceTermId },
      select: {
        id: true,
        isActive: true,
        cefrLevel: true,
        sentence: {
          select: {
            articleId: true,
            contentVersion: true,
            isActive: true,
            article: { select: { cefrLevel: true } },
          },
        },
      },
    });
  }

  async findQuestionDetail(
    quizId: string,
    questionId: string,
  ): Promise<{
    question: AdminQuizQuestionBaseRecord;
    options: AdminQuestionOptionRecord[];
  } | null> {
    const result = await this.prisma.quizQuestion.findFirst({
      where: { id: questionId, quizId },
      select: adminQuestionSelect,
    });
    if (!result) return null;

    const { options, ...question } = result;
    return { question, options };
  }

  async findQuestionForMutation(
    quizId: string,
    questionId: string,
  ): Promise<QuestionMutationState | null> {
    const result = await this.prisma.quizQuestion.findFirst({
      where: { id: questionId, quizId },
      select: {
        ...adminQuestionSelect,
        _count: {
          select: { reviewSessionItems: true, reviewAnswers: true },
        },
      },
    });
    if (!result) return null;

    const { _count, ...question } = result;
    return {
      ...question,
      reviewAnswerCount: _count.reviewSessionItems + _count.reviewAnswers,
    };
  }

  async findOptionForMutation(
    quizId: string,
    questionId: string,
    optionId: string,
  ): Promise<OptionMutationState | null> {
    const result = await this.prisma.questionOption.findFirst({
      where: {
        id: optionId,
        quizQuestionId: questionId,
        quizQuestion: { is: { quizId } },
      },
      select: {
        ...adminOptionSelect,
        quizQuestion: {
          select: {
            id: true,
            quizId: true,
            articleSentenceTermId: true,
            questionType: true,
            generationSource: true,
            difficultyCefr: true,
            prompt: true,
            blankSentence: true,
            correctAnswerText: true,
            answerExplanation: true,
            isCaseSensitive: true,
            points: true,
            displayOrder: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        _count: { select: { reviewAnswers: true } },
      },
    });
    if (!result) return null;

    const { quizQuestion, _count, ...option } = result;
    return {
      question: quizQuestion,
      option,
      reviewAnswerCount: _count.reviewAnswers,
    };
  }

  createQuestion(
    quizId: string,
    input: CreateQuizQuestionInput,
  ): Promise<AdminQuizQuestionRecord> {
    return this.runContentMutation(quizId, async (tx, quiz) => {
      await this.requireCurrentOwnedTerm(tx, quiz, input.articleSentenceTermId);
      return tx.quizQuestion.create({
        data: { quizId, ...input },
        select: adminQuestionSelect,
      });
    });
  }

  updateQuestion(
    quizId: string,
    questionId: string,
    input: UpdateQuizQuestionInput,
  ): Promise<AdminQuizQuestionRecord> {
    return this.runContentMutation(quizId, async (tx, quiz) => {
      const current = await tx.quizQuestion.findFirst({
        where: { id: questionId, quizId },
        select: {
          id: true,
          _count: { select: { options: true } },
        },
      });
      if (!current) throw new QuizOwnedRecordNotFoundError();
      if (
        input.questionType === QuestionType.FILL_BLANK &&
        current._count.options > 0
      ) {
        throw new QuizQuestionTypeConflictError();
      }
      if (input.articleSentenceTermId !== undefined) {
        await this.requireCurrentOwnedTerm(
          tx,
          quiz,
          input.articleSentenceTermId,
        );
      }
      return tx.quizQuestion.update({
        where: { id: questionId },
        data: input,
        select: adminQuestionSelect,
      });
    });
  }

  deleteQuestion(quizId: string, questionId: string): Promise<void> {
    return this.runContentMutation(quizId, async (tx) => {
      const question = await tx.quizQuestion.findFirst({
        where: { id: questionId, quizId },
        select: {
          id: true,
          _count: {
            select: { reviewSessionItems: true, reviewAnswers: true },
          },
        },
      });
      if (!question) throw new QuizOwnedRecordNotFoundError();
      if (
        question._count.reviewSessionItems > 0 ||
        question._count.reviewAnswers > 0
      ) {
        throw new QuizHistoryReferenceError();
      }
      await tx.quizQuestion.delete({
        where: { id: questionId },
        select: { id: true },
      });
    });
  }

  createOption(
    quizId: string,
    questionId: string,
    input: CreateQuestionOptionInput,
  ): Promise<AdminQuestionOptionRecord> {
    return this.runContentMutation(quizId, async (tx) => {
      const question = await tx.quizQuestion.findFirst({
        where: { id: questionId, quizId },
        select: { id: true, questionType: true },
      });
      if (!question) throw new QuizOwnedRecordNotFoundError();
      if (question.questionType === QuestionType.FILL_BLANK) {
        throw new QuizQuestionTypeConflictError();
      }
      return tx.questionOption.create({
        data: { quizQuestionId: questionId, ...input },
        select: adminOptionSelect,
      });
    });
  }

  updateOption(
    quizId: string,
    questionId: string,
    optionId: string,
    input: UpdateQuestionOptionInput,
  ): Promise<AdminQuestionOptionRecord> {
    return this.runContentMutation(quizId, async (tx) => {
      const question = await tx.quizQuestion.findFirst({
        where: { id: questionId, quizId },
        select: { id: true, questionType: true },
      });
      if (!question) throw new QuizOwnedRecordNotFoundError();
      if (question.questionType === QuestionType.FILL_BLANK) {
        throw new QuizQuestionTypeConflictError();
      }
      const updated = await tx.questionOption.updateMany({
        where: { id: optionId, quizQuestionId: questionId },
        data: input,
      });
      if (updated.count !== 1) throw new QuizOwnedRecordNotFoundError();
      const option = await tx.questionOption.findUnique({
        where: { id: optionId },
        select: adminOptionSelect,
      });
      if (!option) throw new QuizOwnedRecordNotFoundError();
      return option;
    });
  }

  deleteOption(
    quizId: string,
    questionId: string,
    optionId: string,
  ): Promise<void> {
    return this.runContentMutation(quizId, async (tx) => {
      const question = await tx.quizQuestion.findFirst({
        where: { id: questionId, quizId },
        select: { id: true, questionType: true },
      });
      if (!question) throw new QuizOwnedRecordNotFoundError();
      if (question.questionType === QuestionType.FILL_BLANK) {
        throw new QuizQuestionTypeConflictError();
      }
      const option = await tx.questionOption.findFirst({
        where: { id: optionId, quizQuestionId: questionId },
        select: {
          id: true,
          _count: { select: { reviewAnswers: true } },
        },
      });
      if (!option) throw new QuizOwnedRecordNotFoundError();
      if (option._count.reviewAnswers > 0) {
        throw new QuizHistoryReferenceError();
      }
      await tx.questionOption.delete({
        where: { id: optionId },
        select: { id: true },
      });
    });
  }

  private runContentMutation<T>(
    quizId: string,
    operation: (
      tx: Prisma.TransactionClient,
      quiz: EditableQuizTransactionState,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const result = await tx.quiz.findFirst({
          where: {
            id: quizId,
            status: QuizStatus.DRAFT,
            reviewSessions: { none: {} },
          },
          select: {
            articleId: true,
            article: { select: { contentVersion: true } },
          },
        });
        if (!result) throw new QuizContentMutationConflictError();
        return operation(tx, {
          articleId: result.articleId,
          articleContentVersion: result.article.contentVersion,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireCurrentOwnedTerm(
    tx: Prisma.TransactionClient,
    quiz: EditableQuizTransactionState,
    articleSentenceTermId: string,
  ): Promise<void> {
    const count = await tx.articleSentenceTerm.count({
      where: {
        id: articleSentenceTermId,
        isActive: true,
        sentence: {
          is: {
            articleId: quiz.articleId,
            contentVersion: quiz.articleContentVersion,
            isActive: true,
          },
        },
      },
    });
    if (count !== 1) throw new QuizSourceTermStateConflictError();
  }
}
