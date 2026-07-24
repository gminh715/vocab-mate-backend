/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  QuestionType,
  ReviewSessionStatus,
  ReviewSessionType,
} from '../generated/prisma/enums';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';
import type { RequestWithUser } from '../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { ReviewsService } from '../src/modules/reviews/services/reviews.service';

const QUIZ_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_QUIZ_ID = '22222222-2222-4222-8222-222222222222';
const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const OPTION_ID = '44444444-4444-4444-8444-444444444444';
const ARTICLE_ID = '55555555-5555-4555-8555-555555555555';

class ReviewAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/u, '');
    if (!token) throw new UnauthorizedException();
    request.user = {
      id: `${token}-id`,
      email: `${token}@example.com`,
      role: token === 'admin' ? 'ADMIN' : 'USER',
      status: 'ACTIVE',
    };
    return true;
  }
}

interface StoredSession {
  id: string;
  userId: string;
  status: ReviewSessionStatus;
  startedAt: Date;
  completedAt: Date | null;
  answered: boolean;
}

class InMemoryReviewsService {
  private sessions = new Map<string, StoredSession>();
  private nextId = 1;

  reset(): void {
    this.sessions.clear();
    this.nextId = 1;
  }

  startQuizSession(userId: string, quizId: string) {
    if (quizId !== QUIZ_ID) throw new NotFoundException('Quiz not found');
    if (
      [...this.sessions.values()].some(
        (session) =>
          session.userId === userId &&
          session.status === ReviewSessionStatus.IN_PROGRESS,
      )
    ) {
      throw new ConflictException();
    }
    const id = `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
    const session: StoredSession = {
      id,
      userId,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date('2026-07-24T00:00:00Z'),
      completedAt: null,
      answered: false,
    };
    this.sessions.set(id, session);
    return {
      session: this.publicSession(session),
      questions: [this.question()],
    };
  }

  getSession(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    return {
      session: this.publicSession(session),
      progress: {
        answeredCount: session.answered ? 1 : 0,
        totalQuestions: 1,
        remainingCount: session.answered ? 0 : 1,
        progressPercent: session.answered ? 100 : 0,
      },
      ...(session.status === ReviewSessionStatus.IN_PROGRESS &&
      !session.answered
        ? { nextQuestion: this.question() }
        : {}),
    };
  }

  submitAnswer(
    userId: string,
    sessionId: string,
    dto: { quizQuestionId: string; selectedOptionId?: string },
  ) {
    const session = this.owned(userId, sessionId);
    if (
      session.status !== ReviewSessionStatus.IN_PROGRESS ||
      session.answered
    ) {
      throw new ConflictException();
    }
    if (
      dto.quizQuestionId !== QUESTION_ID ||
      dto.selectedOptionId !== OPTION_ID
    ) {
      throw new NotFoundException();
    }
    session.answered = true;
    return {
      answerId: '66666666-6666-4666-8666-666666666666',
      isCorrect: true,
      correctAnswer: 'Correct answer',
      explanation: 'Explanation after submission',
      earnedPoints: 2,
    };
  }

  completeSession(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    if (
      session.status !== ReviewSessionStatus.IN_PROGRESS ||
      !session.answered
    ) {
      throw new ConflictException();
    }
    session.status = ReviewSessionStatus.COMPLETED;
    session.completedAt = new Date('2026-07-24T00:05:00Z');
    return { result: this.result(session) };
  }

  abandonSession(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    if (session.status !== ReviewSessionStatus.IN_PROGRESS) {
      throw new ConflictException();
    }
    session.status = ReviewSessionStatus.ABANDONED;
    return { id: session.id, status: session.status };
  }

  getResult(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    if (session.status !== ReviewSessionStatus.COMPLETED) {
      throw new ConflictException();
    }
    return {
      result: this.result(session),
      answers: [
        {
          quizQuestionId: QUESTION_ID,
          questionType: QuestionType.SELECT_MEANING,
          prompt: 'Choose the meaning',
          selectedOption: {
            id: OPTION_ID,
            text: 'Correct answer',
            displayOrder: 1,
          },
          userAnswerText: null,
          correctAnswer: 'Correct answer',
          explanation: 'Explanation after submission',
          isCorrect: true,
          points: 2,
          earnedPoints: 2,
          answeredAt: new Date('2026-07-24T00:01:00Z'),
        },
      ],
    };
  }

  getHistory(userId: string, query: { page: number; limit: number }) {
    const items = [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .map((session) => ({
        session: this.publicSession(session),
        quiz: { id: QUIZ_ID, title: 'Quiz', status: 'PUBLISHED' },
        article: {
          id: ARTICLE_ID,
          title: 'Article',
          slug: 'article',
          status: 'PUBLISHED',
          thumbnailUrl: null,
        },
        aggregates: {
          answeredCount: session.answered ? 1 : 0,
          correctCount: session.answered ? 1 : 0,
          score: session.answered ? 2 : 0,
          totalPoints: 2,
          accuracy: session.answered ? 1 : 0,
        },
      }));
    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: items.length,
        totalPages: Math.ceil(items.length / query.limit),
      },
    };
  }

  getDue() {
    return {
      dueVocabularyCount: 1,
      recommendedQuizzes: [
        {
          id: QUIZ_ID,
          title: 'Quiz',
          description: null,
          publishedAt: new Date('2026-07-20T00:00:00Z'),
          matchingDueVocabularyCount: 1,
          activeQuestionCount: 1,
          totalPoints: 2,
          article: {
            id: ARTICLE_ID,
            title: 'Article',
            slug: 'article',
            thumbnailUrl: null,
          },
        },
      ],
    };
  }

  private owned(userId: string, sessionId: string): StoredSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new NotFoundException();
    return session;
  }

  private publicSession(session: StoredSession) {
    return {
      id: session.id,
      sessionType: ReviewSessionType.QUIZ,
      quizId: QUIZ_ID,
      articleId: ARTICLE_ID,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };
  }

  private question() {
    return {
      id: QUESTION_ID,
      questionType: QuestionType.SELECT_MEANING,
      prompt: 'Choose the meaning',
      blankSentence: null,
      points: 2,
      displayOrder: 1,
      options: [{ id: OPTION_ID, text: 'Correct answer', displayOrder: 1 }],
    };
  }

  private result(session: StoredSession) {
    return {
      score: 2,
      totalPoints: 2,
      accuracy: 1,
      correctCount: 1,
      completedAt: session.completedAt,
    };
  }
}

describe('Reviews API (e2e)', () => {
  let app: INestApplication<App>;
  let reviews: InMemoryReviewsService;

  beforeAll(async () => {
    reviews = new InMemoryReviewsService();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useClass(ReviewAuthGuard)
      .overrideProvider(ReviewsService)
      .useValue(reviews)
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  beforeEach(() => reviews.reset());
  afterAll(() => app.close());

  it('documents bearer auth, questions array, responses and answers array', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const start = response.body.paths['/api/v1/reviews/sessions'].post;
    expect(start.security).toContainEqual({ BearerAuth: [] });
    expect(Object.keys(start.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '404', '409']),
    );
    expect(
      response.body.components.schemas.StartReviewSessionDataDto.properties
        .questions.type,
    ).toBe('array');
    expect(
      response.body.components.schemas.CompletedReviewResultDataDto.properties
        .answers.type,
    ).toBe('array');
  });

  it('runs start, progress, answer, complete, result and history without pre-answer leakage', async () => {
    const start = await request(app.getHttpServer())
      .post('/api/v1/reviews/sessions')
      .set('Authorization', 'Bearer user-a')
      .send({ quizId: QUIZ_ID })
      .expect(201);
    const sessionId = start.body.data.session.id as string;
    expect(start.body.data.questions).toHaveLength(1);
    expect(JSON.stringify(start.body)).not.toMatch(
      /isCorrect|correctAnswer|answerExplanation|explanation/,
    );

    await request(app.getHttpServer())
      .get(`/api/v1/reviews/sessions/${sessionId}`)
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.progress.progressPercent).toBe(0);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/reviews/sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({ quizQuestionId: QUESTION_ID, selectedOptionId: OPTION_ID })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          isCorrect: true,
          correctAnswer: 'Correct answer',
          earnedPoints: 2,
        });
      });

    const completion = await request(app.getHttpServer())
      .post(`/api/v1/reviews/sessions/${sessionId}/complete`)
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    expect(completion.body.data.result.accuracy).toBe(1);

    await request(app.getHttpServer())
      .get(`/api/v1/reviews/sessions/${sessionId}/result`)
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.answers).toHaveLength(1);
        expect(body.data.result).toEqual(completion.body.data.result);
      });

    await request(app.getHttpServer())
      .get('/api/v1/reviews/history?page=1&limit=20')
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => expect(body.data.meta.total).toBe(1));
  });

  it('enforces eligibility, active-session conflict and owner isolation', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reviews/sessions')
      .set('Authorization', 'Bearer user-a')
      .send({ quizId: DRAFT_QUIZ_ID })
      .expect(404);
    const start = await request(app.getHttpServer())
      .post('/api/v1/reviews/sessions')
      .set('Authorization', 'Bearer user-a')
      .send({ quizId: QUIZ_ID })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/reviews/sessions')
      .set('Authorization', 'Bearer user-a')
      .send({ quizId: QUIZ_ID })
      .expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/reviews/sessions/${start.body.data.session.id}`)
      .set('Authorization', 'Bearer user-b')
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/reviews/sessions')
      .set('Authorization', 'Bearer user-b')
      .send({ quizId: QUIZ_ID })
      .expect(201);
  });

  it('prevents answers after abandon and validates attempt/response fields', async () => {
    const start = await request(app.getHttpServer())
      .post('/api/v1/reviews/sessions')
      .set('Authorization', 'Bearer user-a')
      .send({ quizId: QUIZ_ID });
    const sessionId = start.body.data.session.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/reviews/sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        quizQuestionId: QUESTION_ID,
        selectedOptionId: OPTION_ID,
        responseTimeMs: -1,
        attemptNumber: 2,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/reviews/sessions/${sessionId}/abandon`)
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/reviews/sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({ quizQuestionId: QUESTION_ID, selectedOptionId: OPTION_ID })
      .expect(409);
  });

  it('returns deterministic due recommendations without creating a session', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/reviews/due?limit=5&articleId=${ARTICLE_ID}`)
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.dueVocabularyCount).toBe(1);
        expect(body.data.recommendedQuizzes).toHaveLength(1);
      });
    await request(app.getHttpServer())
      .get('/api/v1/reviews/history?page=1&limit=20')
      .set('Authorization', 'Bearer user-a')
      .expect(({ body }) => expect(body.data.meta.total).toBe(0));
  });
});
