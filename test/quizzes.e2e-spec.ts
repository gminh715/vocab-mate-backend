import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  ArticleStatus,
  CefrLevel,
  QuestionType,
  QuizStatus,
} from '../generated/prisma/enums';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';
import type { RequestWithUser } from '../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import type {
  AdminQuestionOptionRecord,
  AdminQuizDetailRecord,
  AdminQuizListRecord,
  AdminQuizQuestionRecord,
  AdminQuizRecord,
  ArticleQuizCreationState,
  CreateQuestionOptionInput,
  CreateQuizInput,
  CreateQuizQuestionInput,
  FindAdminQuizListQuery,
  FindQuizListQuery,
  OptionMutationState,
  PublicQuizDetailBase,
  QuestionMutationState,
  QuestionSourceTermState,
  QuizContentState,
  QuizDeleteSafetyRecord,
  QuizLifecycleState,
  QuizPublicationSnapshot,
  QuizRecord,
  QuizStatusTransitionInput,
  QuizStatusTransitionRecord,
  UpdateQuestionOptionInput,
  UpdateQuizInput,
  UpdateQuizQuestionInput,
} from '../src/modules/quizzes/repositories/quizzes.repository';
import {
  QuizzesRepository,
  QuizStatusTransitionConflictError,
} from '../src/modules/quizzes/repositories/quizzes.repository';

const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ARTICLE_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVED_ARTICLE_ID = '33333333-3333-4333-8333-333333333333';
const PUBLISHED_QUIZ_ID = '44444444-4444-4444-8444-444444444444';
const DRAFT_QUIZ_ID = '55555555-5555-4555-8555-555555555555';
const ARCHIVED_QUIZ_ID = '66666666-6666-4666-8666-666666666666';
const INACCESSIBLE_QUIZ_ID = '77777777-7777-4777-8777-777777777777';
const USED_DRAFT_QUIZ_ID = '88888888-8888-4888-8888-888888888888';
const SECOND_DRAFT_QUIZ_ID = '88888888-9999-4888-8999-888888888888';
const EMPTY_DRAFT_QUIZ_ID = '12121212-1212-4121-8121-121212121212';
const INVALID_OPTIONS_QUIZ_ID = '13131313-1313-4131-8131-131313131313';
const STALE_TERM_QUIZ_ID = '14141414-1414-4141-8141-141414141414';
const USED_ARCHIVED_QUIZ_ID = '15151515-1515-4151-8151-151515151515';
const CURRENT_TERM_ID = '99999999-1111-4999-8999-111111111111';
const FOREIGN_TERM_ID = '99999999-2222-4999-8999-222222222222';
const STALE_TERM_ID = '99999999-3333-4999-8999-333333333333';
const DRAFT_OPTION_QUESTION_ID = 'aaaaaaaa-1111-4aaa-8aaa-111111111111';
const DRAFT_FILL_QUESTION_ID = 'aaaaaaaa-2222-4aaa-8aaa-222222222222';
const REFERENCED_QUESTION_ID = 'aaaaaaaa-3333-4aaa-8aaa-333333333333';
const DRAFT_OPTION_ID = 'bbbbbbbb-1111-4bbb-8bbb-111111111111';
const REFERENCED_OPTION_ID = 'bbbbbbbb-2222-4bbb-8bbb-222222222222';

interface SuccessBody<T> {
  success: true;
  data: T;
}

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string[];
    issues?: Array<{ code: string; message: string; entityId?: string }>;
  };
}

interface StoredArticle extends ArticleQuizCreationState {
  contentVersion: number;
  title: string;
  slug: string;
  summary: string;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  cefrLevel: CefrLevel;
  publishedAt: Date | null;
}

type StoredTerm = QuestionSourceTermState;

interface StoredQuiz extends AdminQuizRecord {
  createdByUserId: string;
  updatedByUserId: string;
  reviewSessionCount: number;
  questions: AdminQuizDetailRecord['questions'];
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

class TestQuizAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/u, '');
    if (!token || !['user', 'admin'].includes(token)) {
      throw new UnauthorizedException('Access token is invalid');
    }
    request.user = {
      id: `${token}-id`,
      email: `${token}@example.com`,
      role: token === 'admin' ? 'ADMIN' : 'USER',
      status: 'ACTIVE',
    };
    return true;
  }
}

class InMemoryQuizzesRepository {
  private readonly articles = new Map<string, StoredArticle>();
  private readonly terms = new Map<string, StoredTerm>();
  private readonly referencedQuestionIds = new Set<string>();
  private readonly referencedOptionIds = new Set<string>();
  private quizzes: StoredQuiz[] = [];
  private nextId = 9;

  constructor() {
    this.reset();
  }

  reset(): void {
    const publishedAt = new Date('2026-07-20T10:00:00Z');
    this.articles.clear();
    this.terms.clear();
    this.referencedQuestionIds.clear();
    this.referencedOptionIds.clear();
    this.articles.set(ARTICLE_ID, {
      id: ARTICLE_ID,
      status: ArticleStatus.PUBLISHED,
      contentVersion: 1,
      title: 'Published Article',
      slug: 'published-article',
      summary: 'Public article summary.',
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: CefrLevel.B1,
      publishedAt,
    });
    this.articles.set(DRAFT_ARTICLE_ID, {
      id: DRAFT_ARTICLE_ID,
      status: ArticleStatus.DRAFT,
      contentVersion: 1,
      title: 'Draft Article',
      slug: 'draft-article',
      summary: 'Not public.',
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: CefrLevel.B1,
      publishedAt: null,
    });
    this.articles.set(ARCHIVED_ARTICLE_ID, {
      id: ARCHIVED_ARTICLE_ID,
      status: ArticleStatus.ARCHIVED,
      contentVersion: 1,
      title: 'Archived Article',
      slug: 'archived-article',
      summary: 'Archived.',
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: CefrLevel.B1,
      publishedAt: null,
    });
    this.terms.set(CURRENT_TERM_ID, {
      id: CURRENT_TERM_ID,
      isActive: true,
      sentence: {
        articleId: ARTICLE_ID,
        contentVersion: 1,
        isActive: true,
      },
    });
    this.terms.set(FOREIGN_TERM_ID, {
      id: FOREIGN_TERM_ID,
      isActive: true,
      sentence: {
        articleId: DRAFT_ARTICLE_ID,
        contentVersion: 1,
        isActive: true,
      },
    });
    this.terms.set(STALE_TERM_ID, {
      id: STALE_TERM_ID,
      isActive: true,
      sentence: {
        articleId: ARTICLE_ID,
        contentVersion: 0,
        isActive: true,
      },
    });
    const now = new Date('2026-07-21T10:00:00Z');
    this.quizzes = [
      this.makeQuiz({
        id: PUBLISHED_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Published Quiz',
        status: QuizStatus.PUBLISHED,
        publishedAt,
        reviewSessionCount: 1,
        questions: [
          {
            id: '11111111-aaaa-4111-8111-111111111111',
            quizId: PUBLISHED_QUIZ_ID,
            articleVocabularyId: '11111111-bbbb-4111-8111-111111111111',
            questionType: QuestionType.SELECT_MEANING,
            prompt: 'Choose the meaning',
            blankSentence: null,
            correctAnswerText: null,
            answerExplanation: 'Private explanation',
            isCaseSensitive: false,
            points: 2,
            displayOrder: 1,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            options: [
              {
                id: '11111111-cccc-4111-8111-111111111111',
                quizQuestionId: '11111111-aaaa-4111-8111-111111111111',
                optionText: 'Correct option',
                isCorrect: true,
                explanation: 'Private option explanation',
                displayOrder: 1,
                createdAt: now,
                updatedAt: now,
              },
            ],
          },
          {
            id: '22222222-aaaa-4222-8222-222222222222',
            quizId: PUBLISHED_QUIZ_ID,
            articleVocabularyId: '22222222-bbbb-4222-8222-222222222222',
            questionType: QuestionType.FILL_BLANK,
            prompt: 'Fill the blank',
            blankSentence: 'A ___ sentence.',
            correctAnswerText: 'private answer',
            answerExplanation: null,
            isCaseSensitive: false,
            points: 3,
            displayOrder: 2,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            options: [],
          },
          {
            id: '33333333-aaaa-4333-8333-333333333333',
            quizId: PUBLISHED_QUIZ_ID,
            articleVocabularyId: '33333333-bbbb-4333-8333-333333333333',
            questionType: QuestionType.FILL_BLANK,
            prompt: 'Inactive',
            blankSentence: null,
            correctAnswerText: 'inactive answer',
            answerExplanation: null,
            isCaseSensitive: false,
            points: 99,
            displayOrder: 3,
            isActive: false,
            createdAt: now,
            updatedAt: now,
            options: [],
          },
        ],
      }),
      this.makeQuiz({
        id: DRAFT_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Unused Draft Quiz',
        status: QuizStatus.DRAFT,
        publishedAt: null,
        questions: [
          this.makeQuestion({
            id: DRAFT_OPTION_QUESTION_ID,
            quizId: DRAFT_QUIZ_ID,
            articleVocabularyId: CURRENT_TERM_ID,
            questionType: QuestionType.SELECT_MEANING,
            prompt: 'Choose a meaning',
            displayOrder: 1,
            options: [
              this.makeOption({
                id: DRAFT_OPTION_ID,
                quizQuestionId: DRAFT_OPTION_QUESTION_ID,
                optionText: 'Existing option',
                displayOrder: 1,
              }),
            ],
          }),
          this.makeQuestion({
            id: DRAFT_FILL_QUESTION_ID,
            quizId: DRAFT_QUIZ_ID,
            articleVocabularyId: CURRENT_TERM_ID,
            questionType: QuestionType.FILL_BLANK,
            prompt: 'Complete the sentence',
            blankSentence: 'A ___ sentence.',
            correctAnswerText: 'sample',
            displayOrder: 2,
          }),
          this.makeQuestion({
            id: REFERENCED_QUESTION_ID,
            quizId: DRAFT_QUIZ_ID,
            articleVocabularyId: CURRENT_TERM_ID,
            questionType: QuestionType.SELECT_WORD,
            prompt: 'Choose a word',
            displayOrder: 3,
            options: [
              this.makeOption({
                id: REFERENCED_OPTION_ID,
                quizQuestionId: REFERENCED_QUESTION_ID,
                optionText: 'Referenced option',
                displayOrder: 1,
              }),
            ],
          }),
        ],
      }),
      this.makeQuiz({
        id: ARCHIVED_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Archived Quiz',
        status: QuizStatus.ARCHIVED,
        publishedAt,
      }),
      this.makeQuiz({
        id: INACCESSIBLE_QUIZ_ID,
        articleId: DRAFT_ARTICLE_ID,
        title: 'Quiz on inaccessible article',
        status: QuizStatus.PUBLISHED,
        publishedAt,
      }),
      this.makeQuiz({
        id: USED_DRAFT_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Used Draft Quiz',
        status: QuizStatus.DRAFT,
        publishedAt: null,
        reviewSessionCount: 1,
        questions: [
          this.makeQuestion({
            id: 'aaaaaaaa-4444-4aaa-8aaa-444444444444',
            quizId: USED_DRAFT_QUIZ_ID,
            articleVocabularyId: CURRENT_TERM_ID,
            questionType: QuestionType.SELECT_CORRECT_CONTEXT,
            prompt: 'Used content',
            displayOrder: 1,
          }),
        ],
      }),
      this.makeQuiz({
        id: SECOND_DRAFT_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Valid Draft Quiz',
        status: QuizStatus.DRAFT,
        publishedAt: null,
        questions: [
          this.makeQuestion({
            id: 'aaaaaaaa-5555-4aaa-8aaa-555555555555',
            quizId: SECOND_DRAFT_QUIZ_ID,
            articleVocabularyId: CURRENT_TERM_ID,
            questionType: QuestionType.SELECT_MEANING,
            prompt: 'Choose the valid meaning',
            displayOrder: 1,
            options: [
              this.makeOption({
                id: 'bbbbbbbb-5555-4bbb-8bbb-555555555551',
                quizQuestionId: 'aaaaaaaa-5555-4aaa-8aaa-555555555555',
                optionText: 'Correct',
                isCorrect: true,
                displayOrder: 1,
              }),
              this.makeOption({
                id: 'bbbbbbbb-5555-4bbb-8bbb-555555555552',
                quizQuestionId: 'aaaaaaaa-5555-4aaa-8aaa-555555555555',
                optionText: 'Incorrect',
                isCorrect: false,
                displayOrder: 2,
              }),
            ],
          }),
        ],
      }),
      this.makeQuiz({
        id: EMPTY_DRAFT_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Empty Draft Quiz',
        status: QuizStatus.DRAFT,
        publishedAt: null,
      }),
      this.makeQuiz({
        id: INVALID_OPTIONS_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Invalid Options Quiz',
        status: QuizStatus.DRAFT,
        publishedAt: null,
        questions: [
          this.makeQuestion({
            id: 'aaaaaaaa-6666-4aaa-8aaa-666666666666',
            quizId: INVALID_OPTIONS_QUIZ_ID,
            articleVocabularyId: CURRENT_TERM_ID,
            questionType: QuestionType.SELECT_WORD,
            prompt: 'Choose a word',
            displayOrder: 1,
            options: [
              this.makeOption({
                id: 'bbbbbbbb-6666-4bbb-8bbb-666666666661',
                quizQuestionId: 'aaaaaaaa-6666-4aaa-8aaa-666666666666',
                optionText: 'First correct',
                isCorrect: true,
                displayOrder: 1,
              }),
              this.makeOption({
                id: 'bbbbbbbb-6666-4bbb-8bbb-666666666662',
                quizQuestionId: 'aaaaaaaa-6666-4aaa-8aaa-666666666666',
                optionText: 'Second correct',
                isCorrect: true,
                displayOrder: 2,
              }),
            ],
          }),
        ],
      }),
      this.makeQuiz({
        id: STALE_TERM_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Stale Term Quiz',
        status: QuizStatus.DRAFT,
        publishedAt: null,
        questions: [
          this.makeQuestion({
            id: 'aaaaaaaa-7777-4aaa-8aaa-777777777777',
            quizId: STALE_TERM_QUIZ_ID,
            articleVocabularyId: STALE_TERM_ID,
            questionType: QuestionType.FILL_BLANK,
            prompt: 'Complete',
            blankSentence: 'A ___ term.',
            correctAnswerText: 'stale',
            displayOrder: 1,
          }),
        ],
      }),
      this.makeQuiz({
        id: USED_ARCHIVED_QUIZ_ID,
        articleId: ARTICLE_ID,
        title: 'Used Archived Quiz',
        status: QuizStatus.ARCHIVED,
        publishedAt,
        reviewSessionCount: 1,
      }),
    ];
    this.referencedQuestionIds.add(REFERENCED_QUESTION_ID);
    this.referencedOptionIds.add(REFERENCED_OPTION_ID);
    this.nextId = 9;
  }

  findPublished(
    query: FindQuizListQuery,
  ): Promise<{ items: QuizRecord[]; total: number }> {
    const filtered = this.quizzes
      .filter(
        (quiz) =>
          quiz.status === QuizStatus.PUBLISHED &&
          this.articles.get(quiz.articleId)?.status === ArticleStatus.PUBLISHED,
      )
      .filter((quiz) => !query.articleId || quiz.articleId === query.articleId)
      .filter(
        (quiz) =>
          !query.q ||
          quiz.title.toLowerCase().includes(query.q.toLowerCase()) ||
          quiz.description?.toLowerCase().includes(query.q.toLowerCase()),
      )
      .sort(
        (left, right) =>
          (right.publishedAt?.getTime() ?? 0) -
            (left.publishedAt?.getTime() ?? 0) ||
          left.id.localeCompare(right.id),
      );
    return Promise.resolve({
      items: filtered
        .slice((query.page - 1) * query.limit, query.page * query.limit)
        .map((quiz) => this.publicQuiz(quiz)),
      total: filtered.length,
    });
  }

  findPublishedDetail(quizId: string): Promise<PublicQuizDetailBase | null> {
    const quiz = this.quizzes.find(
      (item) =>
        item.id === quizId &&
        item.status === QuizStatus.PUBLISHED &&
        this.articles.get(item.articleId)?.status === ArticleStatus.PUBLISHED,
    );
    const article = quiz ? this.articles.get(quiz.articleId) : undefined;
    if (!quiz || !article) return Promise.resolve(null);
    return Promise.resolve({
      quiz: this.publicQuiz(quiz),
      article: { ...article },
    });
  }

  aggregateActiveQuestions(quizId: string) {
    const questions =
      this.quizzes
        .find((quiz) => quiz.id === quizId)
        ?.questions.filter((question) => question.isActive) ?? [];
    return Promise.resolve({
      questionCount: questions.length,
      totalPoints: questions.reduce(
        (sum, question) => sum + question.points,
        0,
      ),
    });
  }

  findAdmin(
    query: FindAdminQuizListQuery,
  ): Promise<{ items: AdminQuizListRecord[]; total: number }> {
    const filtered = this.quizzes
      .filter((quiz) => !query.articleId || quiz.articleId === query.articleId)
      .filter((quiz) => !query.status || quiz.status === query.status)
      .filter(
        (quiz) =>
          !query.q ||
          quiz.title.toLowerCase().includes(query.q.toLowerCase()) ||
          quiz.description?.toLowerCase().includes(query.q.toLowerCase()),
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );
    return Promise.resolve({
      items: filtered
        .slice((query.page - 1) * query.limit, query.page * query.limit)
        .map((quiz) => ({
          ...this.adminQuiz(quiz),
          questionCount: quiz.questions.filter((question) => question.isActive)
            .length,
        })),
      total: filtered.length,
    });
  }

  findAdminDetail(quizId: string): Promise<AdminQuizDetailRecord | null> {
    const quiz = this.quizzes.find((item) => item.id === quizId);
    if (!quiz) return Promise.resolve(null);
    return Promise.resolve({
      quiz: this.adminQuiz(quiz),
      questions: quiz.questions
        .toSorted(
          (left, right) =>
            left.displayOrder - right.displayOrder ||
            left.id.localeCompare(right.id),
        )
        .map((question) => ({
          ...question,
          options: question.options.toSorted(
            (left, right) =>
              left.displayOrder - right.displayOrder ||
              left.id.localeCompare(right.id),
          ),
        })),
    });
  }

  findArticleForCreation(
    articleId: string,
  ): Promise<ArticleQuizCreationState | null> {
    const article = this.articles.get(articleId);
    return Promise.resolve(
      article ? { id: article.id, status: article.status } : null,
    );
  }

  create(input: CreateQuizInput): Promise<AdminQuizRecord> {
    const hex = this.nextId.toString(16);
    this.nextId += 1;
    const quiz = this.makeQuiz({
      id: `${hex.repeat(8)}-${hex.repeat(4)}-4${hex.repeat(3)}-8${hex.repeat(3)}-${hex.repeat(12)}`,
      articleId: input.articleId,
      title: input.title,
      description: input.description ?? null,
      status: QuizStatus.DRAFT,
      publishedAt: null,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
    });
    this.quizzes.push(quiz);
    return Promise.resolve(this.adminQuiz(quiz));
  }

  findMutationState(quizId: string) {
    const quiz = this.quizzes.find((item) => item.id === quizId);
    return Promise.resolve(quiz ? { id: quiz.id, status: quiz.status } : null);
  }

  update(quizId: string, input: UpdateQuizInput): Promise<AdminQuizRecord> {
    const quiz = this.quizzes.find((item) => item.id === quizId);
    if (!quiz) {
      return Promise.reject(
        Object.assign(new Error('Quiz not found'), { code: 'P2025' }),
      );
    }
    if (input.title !== undefined) quiz.title = input.title;
    if (input.description !== undefined) quiz.description = input.description;
    quiz.updatedByUserId = input.updatedByUserId;
    quiz.updatedAt = new Date('2026-07-24T10:00:00Z');
    return Promise.resolve(this.adminQuiz(quiz));
  }

  findDeleteSafety(quizId: string): Promise<QuizDeleteSafetyRecord | null> {
    const quiz = this.quizzes.find((item) => item.id === quizId);
    return Promise.resolve(
      quiz
        ? {
            id: quiz.id,
            status: quiz.status,
            reviewSessionCount: quiz.reviewSessionCount,
          }
        : null,
    );
  }

  deleteUnusedDraft(quizId: string): Promise<boolean> {
    const index = this.quizzes.findIndex(
      (quiz) =>
        quiz.id === quizId &&
        quiz.status === QuizStatus.DRAFT &&
        quiz.reviewSessionCount === 0,
    );
    if (index < 0) return Promise.resolve(false);
    this.quizzes.splice(index, 1);
    return Promise.resolve(true);
  }

  findQuizContentState(quizId: string): Promise<QuizContentState | null> {
    const quiz = this.quizzes.find((item) => item.id === quizId);
    const article = quiz ? this.articles.get(quiz.articleId) : undefined;
    return Promise.resolve(
      quiz && article
        ? {
            id: quiz.id,
            articleId: quiz.articleId,
            articleContentVersion: article.contentVersion,
            status: quiz.status,
            reviewSessionCount: quiz.reviewSessionCount,
          }
        : null,
    );
  }

  findQuizLifecycleState(quizId: string): Promise<QuizLifecycleState | null> {
    const quiz = this.quizzes.find((item) => item.id === quizId);
    return Promise.resolve(
      quiz
        ? {
            id: quiz.id,
            status: quiz.status,
            publishedAt: quiz.publishedAt,
            reviewSessionCount: quiz.reviewSessionCount,
          }
        : null,
    );
  }

  findPublicationSnapshot(
    quizId: string,
  ): Promise<QuizPublicationSnapshot | null> {
    const quiz = this.quizzes.find((item) => item.id === quizId);
    const article = quiz ? this.articles.get(quiz.articleId) : undefined;
    if (!quiz || !article) return Promise.resolve(null);

    return Promise.resolve({
      quiz: {
        id: quiz.id,
        articleId: quiz.articleId,
        status: quiz.status,
        publishedAt: quiz.publishedAt,
      },
      article: {
        id: article.id,
        status: article.status,
        contentVersion: article.contentVersion,
      },
      questions: quiz.questions
        .filter((question) => question.isActive)
        .toSorted(
          (left, right) =>
            left.displayOrder - right.displayOrder ||
            left.id.localeCompare(right.id),
        )
        .map((question) => {
          const term = this.terms.get(question.articleVocabularyId) ?? {
            id: question.articleVocabularyId,
            isActive: false,
            sentence: {
              articleId: quiz.articleId,
              contentVersion: -1,
              isActive: false,
            },
          };
          return {
            id: question.id,
            questionType: question.questionType,
            prompt: question.prompt,
            blankSentence: question.blankSentence,
            correctAnswerText: question.correctAnswerText,
            points: question.points,
            displayOrder: question.displayOrder,
            articleVocabulary: {
              isActive: term.isActive,
              sentence: { ...term.sentence },
            },
            options: question.options
              .toSorted(
                (left, right) =>
                  left.displayOrder - right.displayOrder ||
                  left.id.localeCompare(right.id),
              )
              .map((option) => ({
                id: option.id,
                optionText: option.optionText,
                isCorrect: option.isCorrect,
                displayOrder: option.displayOrder,
              })),
          };
        }),
    });
  }

  transitionQuizStatus(
    input: QuizStatusTransitionInput,
  ): Promise<QuizStatusTransitionRecord> {
    const quiz = this.quizzes.find(
      (item) =>
        item.id === input.quizId &&
        item.status === input.expectedStatus &&
        (!input.requirePublishedArticle ||
          this.articles.get(item.articleId)?.status ===
            ArticleStatus.PUBLISHED) &&
        (!input.requireNoReviewSessions || item.reviewSessionCount === 0),
    );
    if (!quiz) {
      return Promise.reject(new QuizStatusTransitionConflictError());
    }
    quiz.status = input.status;
    if (input.publishedAt !== undefined) {
      quiz.publishedAt = input.publishedAt;
    }
    quiz.updatedByUserId = input.updatedByUserId;
    quiz.updatedAt = new Date('2026-07-24T12:00:00Z');
    return Promise.resolve({
      id: quiz.id,
      status: quiz.status,
      publishedAt: quiz.publishedAt,
    });
  }

  findQuestionSourceTerm(
    articleVocabularyId: string,
  ): Promise<QuestionSourceTermState | null> {
    return Promise.resolve(this.terms.get(articleVocabularyId) ?? null);
  }

  findQuestionDetail(quizId: string, questionId: string) {
    const question = this.findStoredQuestion(quizId, questionId);
    if (!question) return Promise.resolve(null);
    const { options, ...questionData } = question;
    return Promise.resolve({
      question: questionData,
      options: this.sortedOptions(options),
    });
  }

  findQuestionForMutation(
    quizId: string,
    questionId: string,
  ): Promise<QuestionMutationState | null> {
    const question = this.findStoredQuestion(quizId, questionId);
    return Promise.resolve(
      question
        ? {
            ...question,
            options: this.sortedOptions(question.options),
            reviewAnswerCount: this.referencedQuestionIds.has(questionId)
              ? 1
              : 0,
          }
        : null,
    );
  }

  findOptionForMutation(
    quizId: string,
    questionId: string,
    optionId: string,
  ): Promise<OptionMutationState | null> {
    const question = this.findStoredQuestion(quizId, questionId);
    const option = question?.options.find((item) => item.id === optionId);
    if (!question || !option) return Promise.resolve(null);
    const questionData = {
      id: question.id,
      quizId: question.quizId,
      articleVocabularyId: question.articleVocabularyId,
      questionType: question.questionType,
      prompt: question.prompt,
      blankSentence: question.blankSentence,
      correctAnswerText: question.correctAnswerText,
      answerExplanation: question.answerExplanation,
      isCaseSensitive: question.isCaseSensitive,
      points: question.points,
      displayOrder: question.displayOrder,
      isActive: question.isActive,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
    return Promise.resolve({
      question: questionData,
      option,
      reviewAnswerCount: this.referencedOptionIds.has(optionId) ? 1 : 0,
    });
  }

  createQuestion(
    quizId: string,
    input: CreateQuizQuestionInput,
  ): Promise<AdminQuizQuestionRecord> {
    const quiz = this.requireEditableQuiz(quizId);
    this.requireOwnedCurrentTerm(quiz, input.articleVocabularyId);
    this.requireUniqueQuestionOrder(quiz, input.displayOrder);
    const question = this.makeQuestion({
      ...input,
      id: this.newId(),
      quizId,
      options: [],
    });
    quiz.questions.push(question);
    return Promise.resolve(question);
  }

  updateQuestion(
    quizId: string,
    questionId: string,
    input: UpdateQuizQuestionInput,
  ): Promise<AdminQuizQuestionRecord> {
    const quiz = this.requireEditableQuiz(quizId);
    const question = this.findStoredQuestion(quizId, questionId);
    if (!question) throw this.prismaError('P2025');
    if (
      input.questionType === QuestionType.FILL_BLANK &&
      question.options.length > 0
    ) {
      throw this.prismaError('P2034');
    }
    if (input.articleVocabularyId !== undefined) {
      this.requireOwnedCurrentTerm(quiz, input.articleVocabularyId);
    }
    if (
      input.displayOrder !== undefined &&
      input.displayOrder !== question.displayOrder
    ) {
      this.requireUniqueQuestionOrder(quiz, input.displayOrder, questionId);
    }
    Object.assign(question, input, {
      updatedAt: new Date('2026-07-24T10:00:00Z'),
    });
    return Promise.resolve(question);
  }

  deleteQuestion(quizId: string, questionId: string): Promise<void> {
    const quiz = this.requireEditableQuiz(quizId);
    const index = quiz.questions.findIndex((item) => item.id === questionId);
    if (index < 0) throw this.prismaError('P2025');
    if (this.referencedQuestionIds.has(questionId)) {
      throw this.prismaError('P2003');
    }
    quiz.questions.splice(index, 1);
    return Promise.resolve();
  }

  createOption(
    quizId: string,
    questionId: string,
    input: CreateQuestionOptionInput,
  ): Promise<AdminQuestionOptionRecord> {
    this.requireEditableQuiz(quizId);
    const question = this.findStoredQuestion(quizId, questionId);
    if (!question) throw this.prismaError('P2025');
    if (question.questionType === QuestionType.FILL_BLANK) {
      throw this.prismaError('P2034');
    }
    this.requireUniqueOptionOrder(question, input.displayOrder);
    const option = this.makeOption({
      ...input,
      id: this.newId(),
      quizQuestionId: questionId,
    });
    question.options.push(option);
    return Promise.resolve(option);
  }

  updateOption(
    quizId: string,
    questionId: string,
    optionId: string,
    input: UpdateQuestionOptionInput,
  ): Promise<AdminQuestionOptionRecord> {
    this.requireEditableQuiz(quizId);
    const question = this.findStoredQuestion(quizId, questionId);
    const option = question?.options.find((item) => item.id === optionId);
    if (!question || !option) throw this.prismaError('P2025');
    if (question.questionType === QuestionType.FILL_BLANK) {
      throw this.prismaError('P2034');
    }
    if (
      input.displayOrder !== undefined &&
      input.displayOrder !== option.displayOrder
    ) {
      this.requireUniqueOptionOrder(question, input.displayOrder, optionId);
    }
    Object.assign(option, input, {
      updatedAt: new Date('2026-07-24T10:00:00Z'),
    });
    return Promise.resolve(option);
  }

  deleteOption(
    quizId: string,
    questionId: string,
    optionId: string,
  ): Promise<void> {
    this.requireEditableQuiz(quizId);
    const question = this.findStoredQuestion(quizId, questionId);
    const index =
      question?.options.findIndex((item) => item.id === optionId) ?? -1;
    if (!question || index < 0) throw this.prismaError('P2025');
    if (this.referencedOptionIds.has(optionId)) {
      throw this.prismaError('P2003');
    }
    question.options.splice(index, 1);
    return Promise.resolve();
  }

  private makeQuiz(
    input: Pick<
      StoredQuiz,
      'id' | 'articleId' | 'title' | 'status' | 'publishedAt'
    > &
      Partial<StoredQuiz>,
  ): StoredQuiz {
    const now = new Date('2026-07-21T10:00:00Z');
    return {
      id: input.id,
      articleId: input.articleId,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      publishedAt: input.publishedAt,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      createdByUserId: input.createdByUserId ?? 'seed-admin',
      updatedByUserId: input.updatedByUserId ?? 'seed-admin',
      reviewSessionCount: input.reviewSessionCount ?? 0,
      questions: input.questions ?? [],
    };
  }

  private publicQuiz(quiz: StoredQuiz): QuizRecord {
    return {
      id: quiz.id,
      articleId: quiz.articleId,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      publishedAt: quiz.publishedAt,
    };
  }

  private adminQuiz(quiz: StoredQuiz): AdminQuizRecord {
    return {
      ...this.publicQuiz(quiz),
      createdAt: quiz.createdAt,
      updatedAt: quiz.updatedAt,
    };
  }

  private makeQuestion(
    input: Partial<AdminQuizQuestionRecord> &
      Pick<
        AdminQuizQuestionRecord,
        | 'id'
        | 'quizId'
        | 'articleVocabularyId'
        | 'questionType'
        | 'prompt'
        | 'displayOrder'
      >,
  ): AdminQuizQuestionRecord {
    const now = new Date('2026-07-21T10:00:00Z');
    return {
      id: input.id,
      quizId: input.quizId,
      articleVocabularyId: input.articleVocabularyId,
      questionType: input.questionType,
      prompt: input.prompt,
      blankSentence: input.blankSentence ?? null,
      correctAnswerText: input.correctAnswerText ?? null,
      answerExplanation: input.answerExplanation ?? null,
      isCaseSensitive: input.isCaseSensitive ?? false,
      points: input.points ?? 1,
      displayOrder: input.displayOrder,
      isActive: input.isActive ?? true,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      options: input.options ?? [],
    };
  }

  private makeOption(
    input: Partial<AdminQuestionOptionRecord> &
      Pick<
        AdminQuestionOptionRecord,
        'id' | 'quizQuestionId' | 'optionText' | 'displayOrder'
      >,
  ): AdminQuestionOptionRecord {
    const now = new Date('2026-07-21T10:00:00Z');
    return {
      id: input.id,
      quizQuestionId: input.quizQuestionId,
      optionText: input.optionText,
      isCorrect: input.isCorrect ?? false,
      explanation: input.explanation ?? null,
      displayOrder: input.displayOrder,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
  }

  private findStoredQuestion(
    quizId: string,
    questionId: string,
  ): AdminQuizQuestionRecord | undefined {
    return this.quizzes
      .find((quiz) => quiz.id === quizId)
      ?.questions.find((question) => question.id === questionId);
  }

  private sortedOptions(
    options: AdminQuestionOptionRecord[],
  ): AdminQuestionOptionRecord[] {
    return options.toSorted(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.id.localeCompare(right.id),
    );
  }

  private requireEditableQuiz(quizId: string): StoredQuiz {
    const quiz = this.quizzes.find((item) => item.id === quizId);
    if (
      !quiz ||
      quiz.status !== QuizStatus.DRAFT ||
      quiz.reviewSessionCount > 0
    ) {
      throw this.prismaError('P2034');
    }
    return quiz;
  }

  private requireOwnedCurrentTerm(
    quiz: StoredQuiz,
    articleVocabularyId: string,
  ): void {
    const term = this.terms.get(articleVocabularyId);
    const article = this.articles.get(quiz.articleId);
    if (
      !term ||
      !article ||
      !term.isActive ||
      !term.sentence.isActive ||
      term.sentence.articleId !== quiz.articleId ||
      term.sentence.contentVersion !== article.contentVersion
    ) {
      throw this.prismaError('P2034');
    }
  }

  private requireUniqueQuestionOrder(
    quiz: StoredQuiz,
    displayOrder: number,
    excludedId?: string,
  ): void {
    if (
      quiz.questions.some(
        (question) =>
          question.id !== excludedId && question.displayOrder === displayOrder,
      )
    ) {
      throw this.prismaError('P2002');
    }
  }

  private requireUniqueOptionOrder(
    question: AdminQuizQuestionRecord,
    displayOrder: number,
    excludedId?: string,
  ): void {
    if (
      question.options.some(
        (option) =>
          option.id !== excludedId && option.displayOrder === displayOrder,
      )
    ) {
      throw this.prismaError('P2002');
    }
  }

  private newId(): string {
    const suffix = this.nextId.toString(16).padStart(12, '0');
    this.nextId += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  }

  private prismaError(code: string): Error & { code: string } {
    return Object.assign(new Error(code), { code });
  }
}

describe('Quiz APIs (e2e)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryQuizzesRepository;

  beforeAll(async () => {
    repository = new InMemoryQuizzesRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(QuizzesRepository)
      .useValue(repository)
      .overrideGuard(JwtAuthGuard)
      .useClass(TestQuizAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  beforeEach(() => repository.reset());
  afterAll(async () => app.close());

  it('documents QUI-001 through QUI-007 and hides answer fields publicly', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            security: Array<Record<string, string[]>>;
            responses: Record<string, object>;
          }
        >
      >;
      components: {
        schemas: Record<string, { properties: Record<string, unknown> }>;
      };
    }>(response);
    const publicPath = swagger.paths['/api/v1/quizzes'];
    const adminPath = swagger.paths['/api/v1/admin/quizzes'];
    const adminDetail = swagger.paths['/api/v1/admin/quizzes/{quizId}'];

    expect(publicPath.get.security).toContainEqual({ BearerAuth: [] });
    expect(adminPath.get.security).toContainEqual({ BearerAuth: [] });
    expect(Object.keys(adminPath.post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '403', '404', '409']),
    );
    expect(Object.keys(adminDetail.delete.responses)).toContain('204');
    expect(
      swagger.components.schemas.PublicQuizDetailDataDto.properties,
    ).not.toHaveProperty('questions');
    expect(swagger.components.schemas.QuizDto.properties).not.toHaveProperty(
      'correctAnswerText',
    );
    expect(
      swagger.components.schemas.AdminQuizQuestionDto.properties,
    ).toHaveProperty('correctAnswerText');
  });

  it('documents QUI-008 through QUI-014 as bearer-protected admin APIs', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            security: Array<Record<string, string[]>>;
            responses: Record<string, object>;
          }
        >
      >;
      components: {
        schemas: Record<string, { properties: Record<string, unknown> }>;
      };
    }>(response);
    const questionCollection =
      swagger.paths['/api/v1/admin/quizzes/{quizId}/questions'];
    const questionDetail =
      swagger.paths['/api/v1/admin/quizzes/{quizId}/questions/{questionId}'];
    const optionCollection =
      swagger.paths[
        '/api/v1/admin/quizzes/{quizId}/questions/{questionId}/options'
      ];
    const optionDetail =
      swagger.paths[
        '/api/v1/admin/quizzes/{quizId}/questions/{questionId}/options/{optionId}'
      ];

    for (const operation of [
      questionCollection.post,
      questionDetail.get,
      questionDetail.patch,
      questionDetail.delete,
      optionCollection.post,
      optionDetail.patch,
      optionDetail.delete,
    ]) {
      expect(operation.security).toContainEqual({ BearerAuth: [] });
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['400', '401', '403', '404']),
      );
    }
    for (const operation of [
      questionCollection.post,
      questionDetail.patch,
      questionDetail.delete,
      optionCollection.post,
      optionDetail.patch,
      optionDetail.delete,
    ]) {
      expect(Object.keys(operation.responses)).toContain('409');
    }
    expect(Object.keys(questionCollection.post.responses)).toContain('201');
    expect(Object.keys(optionCollection.post.responses)).toContain('201');
    expect(Object.keys(questionDetail.delete.responses)).toContain('204');
    expect(Object.keys(optionDetail.delete.responses)).toContain('204');
    expect(
      swagger.components.schemas.AdminQuizQuestionDto.properties,
    ).toHaveProperty('correctAnswerText');
    expect(
      swagger.components.schemas.AdminQuestionOptionDto.properties,
    ).toHaveProperty('isCorrect');
  });

  it('documents QUI-015 through QUI-017 with lifecycle response contracts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            security: Array<Record<string, string[]>>;
            responses: Record<string, object>;
          }
        >
      >;
      components: {
        schemas: Record<string, { properties: Record<string, unknown> }>;
      };
    }>(response);
    const publish =
      swagger.paths['/api/v1/admin/quizzes/{quizId}/publish'].post;
    const archive =
      swagger.paths['/api/v1/admin/quizzes/{quizId}/archive'].post;
    const restore =
      swagger.paths['/api/v1/admin/quizzes/{quizId}/restore-draft'].post;

    for (const operation of [publish, archive, restore]) {
      expect(operation.security).toContainEqual({ BearerAuth: [] });
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['200', '400', '401', '403', '404', '409']),
      );
    }
    expect(Object.keys(publish.responses)).toContain('422');
    expect(
      swagger.components.schemas.QuizPublishResultDto.properties,
    ).toHaveProperty('publishedAt');
    expect(
      swagger.components.schemas.QuizStatusTransitionResultDto.properties,
    ).not.toHaveProperty('publishedAt');
  });

  it('returns 401 without authentication and 403 for USER admin access', async () => {
    await request(app.getHttpServer()).get('/api/v1/quizzes').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/quizzes?page=1&limit=20')
      .set('Authorization', 'Bearer user')
      .expect(403);
  });

  it('lets authenticated users see only accessible published quizzes with database-style pagination', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/quizzes?page=1&limit=1')
      .set('Authorization', 'Bearer user')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: QuizRecord[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>
    >(response);

    expect(body.data.items.map(({ id }) => id)).toEqual([PUBLISHED_QUIZ_ID]);
    expect(body.data.meta).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
    expect(JSON.stringify(body)).not.toContain('Draft Quiz');
    expect(JSON.stringify(body)).not.toContain('inaccessible');
    expect(JSON.stringify(body)).not.toContain('questions');
  });

  it('returns active aggregate totals and never exposes public answers', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/quizzes/${PUBLISHED_QUIZ_ID}`)
      .set('Authorization', 'Bearer user')
      .expect(200);
    const body =
      responseBody<SuccessBody<{ questionCount: number; totalPoints: number }>>(
        response,
      );

    expect(body.data).toMatchObject({ questionCount: 2, totalPoints: 5 });
    expect(JSON.stringify(body)).not.toContain('prompt');
    expect(JSON.stringify(body)).not.toContain('private answer');
    expect(JSON.stringify(body)).not.toContain('isCorrect');
  });

  it.each([DRAFT_QUIZ_ID, ARCHIVED_QUIZ_ID, INACCESSIBLE_QUIZ_ID])(
    'returns the same public 404 for %s',
    async (quizId) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/quizzes/${quizId}`)
        .set('Authorization', 'Bearer user')
        .expect(404);
      expect(responseBody<ErrorBody>(response).error).toEqual({
        code: 'NOT_FOUND',
        message: 'Quiz not found',
      });
    },
  );

  it('separates admin data and returns ordered answer-bearing nested detail', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/quizzes?page=1&limit=20&status=PUBLISHED')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(
      responseBody<SuccessBody<{ items: AdminQuizListRecord[] }>>(list).data
        .items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: PUBLISHED_QUIZ_ID,
          questionCount: 2,
        }),
        expect.objectContaining({ id: INACCESSIBLE_QUIZ_ID }),
      ]),
    );

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/quizzes/${PUBLISHED_QUIZ_ID}`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    const detailBody = responseBody<SuccessBody<AdminQuizDetailRecord>>(detail);
    expect(
      detailBody.data.questions.map(({ displayOrder }) => displayOrder),
    ).toEqual([1, 2, 3]);
    expect(detailBody.data.questions[0].options[0]).toMatchObject({
      isCorrect: true,
      explanation: 'Private option explanation',
    });
    expect(JSON.stringify(detailBody)).not.toContain('createdByUserId');
    expect(JSON.stringify(detailBody)).not.toContain('updatedByUserId');
  });

  it('creates a trimmed DRAFT quiz with 201 and rejects client-controlled status', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/quizzes')
      .set('Authorization', 'Bearer admin')
      .send({
        articleId: ARTICLE_ID,
        title: '  New Quiz  ',
        description: '  New description  ',
      })
      .expect(201);
    expect(
      responseBody<SuccessBody<{ quiz: AdminQuizRecord }>>(created).data.quiz,
    ).toMatchObject({
      articleId: ARTICLE_ID,
      title: 'New Quiz',
      description: 'New description',
      status: QuizStatus.DRAFT,
      publishedAt: null,
    });

    await request(app.getHttpServer())
      .post('/api/v1/admin/quizzes')
      .set('Authorization', 'Bearer admin')
      .send({
        articleId: ARTICLE_ID,
        title: 'Unsafe Quiz',
        status: QuizStatus.PUBLISHED,
      })
      .expect(400);
  });

  it('updates metadata partially and rejects empty or archived updates', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/quizzes/${PUBLISHED_QUIZ_ID}`)
      .set('Authorization', 'Bearer admin')
      .send({ title: '  Updated Quiz  ' })
      .expect(200);
    expect(
      responseBody<SuccessBody<{ quiz: AdminQuizRecord }>>(updated).data.quiz,
    ).toMatchObject({
      title: 'Updated Quiz',
      articleId: ARTICLE_ID,
      status: QuizStatus.PUBLISHED,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/quizzes/${PUBLISHED_QUIZ_ID}`)
      .set('Authorization', 'Bearer admin')
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/quizzes/${ARCHIVED_QUIZ_ID}`)
      .set('Authorization', 'Bearer admin')
      .send({ title: 'No' })
      .expect(409);
  });

  it('returns true 204 for an unused draft and 409 for used or non-draft quizzes', async () => {
    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}`)
      .set('Authorization', 'Bearer admin')
      .expect(204);
    expect(deleted.text).toBe('');

    for (const quizId of [USED_DRAFT_QUIZ_ID, PUBLISHED_QUIZ_ID]) {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/quizzes/${quizId}`)
        .set('Authorization', 'Bearer admin')
        .expect(409);
    }
  });

  it.each([
    {
      questionType: QuestionType.SELECT_MEANING,
      displayOrder: 10,
    },
    {
      questionType: QuestionType.SELECT_WORD,
      displayOrder: 11,
    },
    {
      questionType: QuestionType.SELECT_CORRECT_CONTEXT,
      displayOrder: 12,
    },
    {
      questionType: QuestionType.FILL_BLANK,
      blankSentence: 'This is a ___ sentence.',
      correctAnswerText: 'sample',
      displayOrder: 13,
    },
  ])(
    'lets ADMIN create $questionType with 201',
    async ({ questionType, displayOrder, ...shape }) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}/questions`)
        .set('Authorization', 'Bearer admin')
        .send({
          articleVocabularyId: CURRENT_TERM_ID,
          questionType,
          prompt: '  New question  ',
          displayOrder,
          ...shape,
        })
        .expect(201);
      expect(
        responseBody<SuccessBody<{ question: AdminQuizQuestionRecord }>>(
          response,
        ).data.question,
      ).toMatchObject({
        quizId: DRAFT_QUIZ_ID,
        questionType,
        prompt: 'New question',
        displayOrder,
      });
    },
  );

  it('enforces admin role, question shape, and source-term ownership', async () => {
    const endpoint = `/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}/questions`;
    const base = {
      articleVocabularyId: CURRENT_TERM_ID,
      questionType: QuestionType.SELECT_MEANING,
      prompt: 'Question',
      displayOrder: 10,
    };

    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer user')
      .send(base)
      .expect(403);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer admin')
      .send({
        ...base,
        questionType: QuestionType.FILL_BLANK,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer admin')
      .send({ ...base, articleVocabularyId: FOREIGN_TERM_ID })
      .expect(422);
  });

  it('returns generic 404 for a cross-quiz question identifier', async () => {
    const endpoint =
      `/api/v1/admin/quizzes/${SECOND_DRAFT_QUIZ_ID}/questions/` +
      DRAFT_OPTION_QUESTION_ID;
    const getResponse = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', 'Bearer admin')
      .expect(404);
    expect(responseBody<ErrorBody>(getResponse).error.code).toBe('NOT_FOUND');

    await request(app.getHttpServer())
      .patch(endpoint)
      .set('Authorization', 'Bearer admin')
      .send({ prompt: 'Cross quiz' })
      .expect(404);
  });

  it('creates and updates options, but rejects options for FILL_BLANK', async () => {
    const optionBase =
      `/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}/questions/` +
      DRAFT_OPTION_QUESTION_ID;
    const created = await request(app.getHttpServer())
      .post(`${optionBase}/options`)
      .set('Authorization', 'Bearer admin')
      .send({
        optionText: '  New option  ',
        isCorrect: true,
        displayOrder: 2,
      })
      .expect(201);
    const option =
      responseBody<SuccessBody<{ option: AdminQuestionOptionRecord }>>(created)
        .data.option;
    expect(option).toMatchObject({
      optionText: 'New option',
      isCorrect: true,
      displayOrder: 2,
    });

    const updated = await request(app.getHttpServer())
      .patch(`${optionBase}/options/${option.id}`)
      .set('Authorization', 'Bearer admin')
      .send({ explanation: '  Updated explanation  ' })
      .expect(200);
    expect(
      responseBody<SuccessBody<{ option: AdminQuestionOptionRecord }>>(updated)
        .data.option.explanation,
    ).toBe('Updated explanation');

    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}/questions/` +
          `${DRAFT_FILL_QUESTION_ID}/options`,
      )
      .set('Authorization', 'Bearer admin')
      .send({ optionText: 'Not allowed', displayOrder: 1 })
      .expect(409);
  });

  it('locks all content mutations after any review session exists', async () => {
    const endpoint =
      `/api/v1/admin/quizzes/${USED_DRAFT_QUIZ_ID}/questions/` +
      'aaaaaaaa-4444-4aaa-8aaa-444444444444';
    await request(app.getHttpServer())
      .patch(endpoint)
      .set('Authorization', 'Bearer admin')
      .send({ prompt: 'Changed historical content' })
      .expect(409);
    await request(app.getHttpServer())
      .delete(endpoint)
      .set('Authorization', 'Bearer admin')
      .expect(409);
  });

  it('returns 204 for unused content and 409 for review-answer references', async () => {
    const unusedOptionEndpoint =
      `/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}/questions/` +
      `${DRAFT_OPTION_QUESTION_ID}/options/${DRAFT_OPTION_ID}`;
    const deletedOption = await request(app.getHttpServer())
      .delete(unusedOptionEndpoint)
      .set('Authorization', 'Bearer admin')
      .expect(204);
    expect(deletedOption.text).toBe('');

    const deletedQuestion = await request(app.getHttpServer())
      .delete(
        `/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}/questions/` +
          DRAFT_OPTION_QUESTION_ID,
      )
      .set('Authorization', 'Bearer admin')
      .expect(204);
    expect(deletedQuestion.text).toBe('');

    await request(app.getHttpServer())
      .delete(
        `/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}/questions/` +
          REFERENCED_QUESTION_ID,
      )
      .set('Authorization', 'Bearer admin')
      .expect(409);
    await request(app.getHttpServer())
      .delete(
        `/api/v1/admin/quizzes/${DRAFT_QUIZ_ID}/questions/` +
          `${REFERENCED_QUESTION_ID}/options/${REFERENCED_OPTION_ID}`,
      )
      .set('Authorization', 'Bearer admin')
      .expect(409);
  });

  it('publishes a complete draft and rejects USER access', async () => {
    const endpoint = `/api/v1/admin/quizzes/${SECOND_DRAFT_QUIZ_ID}/publish`;
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer user')
      .expect(403);

    const response = await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    const result = responseBody<
      SuccessBody<{
        id: string;
        status: QuizStatus;
        publishedAt: string;
      }>
    >(response).data;
    expect(result).toMatchObject({
      id: SECOND_DRAFT_QUIZ_ID,
      status: QuizStatus.PUBLISHED,
    });
    expect(new Date(result.publishedAt).toString()).not.toBe('Invalid Date');

    await request(app.getHttpServer())
      .get(`/api/v1/quizzes/${SECOND_DRAFT_QUIZ_ID}`)
      .set('Authorization', 'Bearer user')
      .expect(200);
  });

  it.each([
    [EMPTY_DRAFT_QUIZ_ID, 'NO_ACTIVE_QUESTIONS'],
    [INVALID_OPTIONS_QUIZ_ID, 'CORRECT_OPTION_COUNT_INVALID'],
    [STALE_TERM_QUIZ_ID, 'QUESTION_TERM_NOT_CURRENT_ACTIVE'],
  ])(
    'returns 422 when quiz %s fails publication with %s',
    async (quizId, issueCode) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${quizId}/publish`)
        .set('Authorization', 'Bearer admin')
        .expect(422);
      const error = responseBody<ErrorBody>(response).error;
      expect(error).toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Quiz failed publication validation',
      });
      expect(error.issues?.map(({ code }) => code)).toContain(issueCode);
    },
  );

  it('archives without losing in-progress history or nested content and removes public visibility', async () => {
    const before = await repository.findQuizLifecycleState(PUBLISHED_QUIZ_ID);
    expect(before?.reviewSessionCount).toBe(1);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${PUBLISHED_QUIZ_ID}/archive`)
      .set('Authorization', 'Bearer admin')
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/quizzes/${PUBLISHED_QUIZ_ID}`)
      .set('Authorization', 'Bearer user')
      .expect(404);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/quizzes/${PUBLISHED_QUIZ_ID}`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(
      responseBody<SuccessBody<AdminQuizDetailRecord>>(detail).data.questions,
    ).toHaveLength(3);
    const after = await repository.findQuizLifecycleState(PUBLISHED_QUIZ_ID);
    expect(after).toMatchObject({
      status: QuizStatus.ARCHIVED,
      reviewSessionCount: 1,
    });
    expect(after?.publishedAt).toEqual(before?.publishedAt);
  });

  it('restores an unused archived quiz but rejects a used archived quiz', async () => {
    const restored = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${ARCHIVED_QUIZ_ID}/restore-draft`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(
      responseBody<SuccessBody<{ id: string; status: QuizStatus }>>(restored)
        .data,
    ).toEqual({
      id: ARCHIVED_QUIZ_ID,
      status: QuizStatus.DRAFT,
    });
    await expect(
      repository.findQuizLifecycleState(ARCHIVED_QUIZ_ID),
    ).resolves.toMatchObject({
      status: QuizStatus.DRAFT,
      publishedAt: null,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${USED_ARCHIVED_QUIZ_ID}/restore-draft`)
      .set('Authorization', 'Bearer admin')
      .expect(409);
  });

  it('allows only one winner for concurrent conditional publication', async () => {
    const endpoint = `/api/v1/admin/quizzes/${SECOND_DRAFT_QUIZ_ID}/publish`;
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', 'Bearer admin'),
      request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', 'Bearer admin'),
    ]);

    expect(responses.map(({ status }) => status).toSorted()).toEqual([
      200, 409,
    ]);
    const state = await repository.findQuizLifecycleState(SECOND_DRAFT_QUIZ_ID);
    expect(state).toMatchObject({
      status: QuizStatus.PUBLISHED,
    });
    expect(state?.publishedAt).toBeInstanceOf(Date);
  });
});
