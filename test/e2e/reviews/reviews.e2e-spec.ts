/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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
  ReviewAgentAction,
  ReviewDecisionSource,
  ReviewErrorType,
  ReviewSessionStatus,
  ReviewSkillDimension,
} from '../../../generated/prisma/enums';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { AuthenticatedUserThrottlerGuard } from '../../../src/common/guards/authenticated-user-throttler.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import type { RequestWithUser } from '../../../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { ReviewsService } from '../../../src/modules/reviews/services/reviews.service';

const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const RETRY_QUESTION_ID = '33333333-3333-4333-8333-333333333334';
const OPTION_ID = '44444444-4444-4444-8444-444444444444';
const WRONG_OPTION_ID = '44444444-4444-4444-8444-444444444445';
const USER_VOCABULARY_ID = '88888888-8888-4888-8888-888888888888';
const SESSION_ITEM_ID = '99999999-9999-4999-8999-999999999999';

class ReviewAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/u, '');
    if (!token) throw new UnauthorizedException();
    req.user = {
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
  outcome: 'PENDING' | 'RETRY' | 'CORRECT' | 'INCORRECT' | 'SKIPPED';
}

class InMemoryReviewsService {
  private sessions = new Map<string, StoredSession>();
  private nextId = 1;

  reset(): void {
    this.sessions.clear();
    this.nextId = 1;
  }

  startSession(userId: string) {
    const compatible = [...this.sessions.values()].find(
      (session) =>
        session.userId === userId &&
        session.status === ReviewSessionStatus.IN_PROGRESS,
    );
    if (compatible) return this.getSession(userId, compatible.id);

    const id = `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
    this.sessions.set(id, {
      id,
      userId,
      status: ReviewSessionStatus.IN_PROGRESS,
      startedAt: new Date('2026-08-03T00:00:00Z'),
      completedAt: null,
      outcome: 'PENDING',
    });
    return this.getSession(userId, id);
  }

  getActiveSession(userId: string) {
    const session = [...this.sessions.values()]
      .filter(
        (candidate) =>
          candidate.userId === userId &&
          candidate.status === ReviewSessionStatus.IN_PROGRESS,
      )
      .at(-1);
    if (!session) throw new NotFoundException();
    return this.getSession(userId, session.id);
  }

  getSession(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    const completed = session.status === ReviewSessionStatus.COMPLETED;
    return {
      session: this.publicSession(session),
      progress: {
        answeredCount: completed ? 1 : 0,
        totalQuestions: 1,
        remainingCount: completed ? 0 : 1,
        progressPercent: completed ? 100 : 0,
      },
      ...(session.status === ReviewSessionStatus.IN_PROGRESS && !completed
        ? { nextItem: this.item(session) }
        : {}),
    };
  }

  submitAnswer(
    userId: string,
    sessionId: string,
    dto: {
      reviewSessionItemId: string;
      reviewQuestionId: string;
      selectedOptionId?: string;
      hintsUsed?: number;
    },
  ) {
    const session = this.activeOwned(userId, sessionId);
    this.validateActivePair(session, dto);
    if (
      dto.selectedOptionId !== OPTION_ID &&
      dto.selectedOptionId !== WRONG_OPTION_ID
    ) {
      throw new NotFoundException();
    }
    const isRetry = session.outcome === 'RETRY';
    const isCorrect = dto.selectedOptionId === OPTION_ID;
    if (!isCorrect && !isRetry) {
      session.outcome = 'RETRY';
      return {
        answerId: '66666666-6666-4666-8666-666666666666',
        isCorrect: false,
        correctAnswer: 'Correct answer',
        explanation: 'This is the contextual meaning. It fits the sentence.',
        earnedPoints: 0,
        inferredReviewScore: 0,
        willReturnLater: true,
        sessionCompleted: false,
        agentFeedback: {
          source: ReviewDecisionSource.AI,
          action: ReviewAgentAction.TEACH_AND_REQUEUE,
          skillDimension: ReviewSkillDimension.CONTEXT,
          errorType: ReviewErrorType.CONFUSABLE_WORD,
          microLesson: {
            title: 'Contrast the meanings',
            explanation: 'The selected word does not fit this context.',
            example: 'Use the target word in the original context.',
          },
          retestAfterItems: 3,
        },
        progress: this.getSession(userId, sessionId).progress,
        nextQuestion: this.item(session),
      };
    }
    session.outcome = isCorrect ? 'CORRECT' : 'INCORRECT';
    this.complete(session);
    return {
      answerId: '66666666-6666-4666-8666-666666666666',
      isCorrect,
      correctAnswer: 'Correct answer',
      explanation: 'This is the contextual meaning. It fits the sentence.',
      earnedPoints: isCorrect ? 2 : 0,
      inferredReviewScore: isCorrect
        ? isRetry
          ? 2
          : dto.hintsUsed
            ? 3
            : 4
        : 0,
      willReturnLater: false,
      sessionCompleted: true,
      progress: this.getSession(userId, sessionId).progress,
      completionSummary: this.result(session),
    };
  }

  skipItem(
    userId: string,
    sessionId: string,
    dto: { reviewSessionItemId: string; reviewQuestionId: string },
  ) {
    const session = this.activeOwned(userId, sessionId);
    this.validateActivePair(session, dto);
    session.outcome = 'SKIPPED';
    this.complete(session);
    return {
      inferredReviewScore: 0,
      sessionCompleted: true,
      progress: this.getSession(userId, sessionId).progress,
      completionSummary: this.result(session),
    };
  }

  abandonSession(userId: string, sessionId: string) {
    const session = this.activeOwned(userId, sessionId);
    session.status = ReviewSessionStatus.ABANDONED;
    return { id: session.id, status: session.status };
  }

  getSummary(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    if (session.status !== ReviewSessionStatus.COMPLETED) {
      throw new ConflictException();
    }
    return {
      result: this.result(session),
      answers:
        session.outcome === 'CORRECT'
          ? [
              {
                reviewQuestionId: QUESTION_ID,
                questionType: QuestionType.SELECT_MEANING,
                prompt: 'Choose the meaning',
                selectedOption: {
                  id: OPTION_ID,
                  text: 'Correct answer',
                  displayOrder: 1,
                },
                userAnswerText: null,
                correctAnswer: 'Correct answer',
                explanation:
                  'This is the contextual meaning. It fits the sentence.',
                isCorrect: true,
                points: 2,
                earnedPoints: 2,
                answeredAt: new Date('2026-08-03T00:01:00Z'),
              },
            ]
          : [],
    };
  }

  getToday() {
    return {
      dueVocabularyCount: 1,
    };
  }

  getHistory(userId: string, query: { page: number; limit: number }) {
    const items = [...this.sessions.values()].filter(
      (session) => session.userId === userId,
    );
    return {
      items: [],
      meta: {
        page: query.page,
        limit: query.limit,
        total: items.length,
        totalPages: Math.ceil(items.length / query.limit),
      },
    };
  }

  private validateActivePair(
    session: StoredSession,
    dto: {
      reviewSessionItemId: string;
      reviewQuestionId: string;
    },
  ): void {
    const expectedQuestionId =
      session.outcome === 'RETRY' ? RETRY_QUESTION_ID : QUESTION_ID;
    if (
      dto.reviewSessionItemId !== SESSION_ITEM_ID ||
      dto.reviewQuestionId !== expectedQuestionId
    ) {
      throw new ConflictException();
    }
  }

  private activeOwned(userId: string, sessionId: string): StoredSession {
    const session = this.owned(userId, sessionId);
    if (session.status !== ReviewSessionStatus.IN_PROGRESS) {
      throw new ConflictException();
    }
    return session;
  }

  private owned(userId: string, sessionId: string): StoredSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new NotFoundException();
    return session;
  }

  private complete(session: StoredSession): void {
    session.status = ReviewSessionStatus.COMPLETED;
    session.completedAt = new Date('2026-08-03T00:05:00Z');
  }

  private publicSession(session: StoredSession) {
    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };
  }

  private item(session: StoredSession) {
    const isRetry = session.outcome === 'RETRY';
    return {
      id: SESSION_ITEM_ID,
      userVocabularyId: USER_VOCABULARY_ID,
      attemptNumber: isRetry ? 2 : 1,
      question: {
        id: isRetry ? RETRY_QUESTION_ID : QUESTION_ID,
        questionType: isRetry
          ? QuestionType.SELECT_WORD
          : QuestionType.SELECT_MEANING,
        prompt: isRetry ? 'Choose the word' : 'Choose the meaning',
        blankSentence: null,
        points: 2,
        displayOrder: 1,
        options: [
          { id: OPTION_ID, text: 'Correct answer', displayOrder: 1 },
          { id: WRONG_OPTION_ID, text: 'Wrong answer', displayOrder: 2 },
        ],
      },
    };
  }

  private result(session: StoredSession) {
    const correct = session.outcome === 'CORRECT';
    return {
      score: correct ? 2 : 0,
      totalPoints: 2,
      accuracy: correct ? 1 : 0,
      correctCount: correct ? 1 : 0,
      completedAt: session.completedAt,
    };
  }
}

describe('Review REST APIs (e2e)', () => {
  let app: INestApplication<App>;
  let reviews: InMemoryReviewsService;

  beforeAll(async () => {
    reviews = new InMemoryReviewsService();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useClass(ReviewAuthGuard)
      .overrideGuard(AuthenticatedUserThrottlerGuard)
      .useValue({ canActivate: () => true })
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

  it('documents every required route and the server-owned attempt contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const paths = response.body.paths;
    for (const path of [
      '/api/v1/reviews/today',
      '/api/v1/review-sessions',
      '/api/v1/review-sessions/active',
      '/api/v1/review-sessions/{sessionId}',
      '/api/v1/review-sessions/{sessionId}/answers',
      '/api/v1/review-sessions/{sessionId}/skip',
      '/api/v1/review-sessions/{sessionId}/abandon',
      '/api/v1/review-sessions/{sessionId}/summary',
    ]) {
      expect(paths).toHaveProperty(path);
    }
    const answerProperties =
      response.body.components.schemas.SubmitReviewAnswerDto.properties;
    expect(answerProperties).toHaveProperty('reviewSessionItemId');
    expect(answerProperties).not.toHaveProperty('attemptNumber');
    expect(
      response.body.components.schemas.SessionReviewQuestionOptionDto
        .properties,
    ).not.toHaveProperty('isCorrect');
    expect(
      response.body.components.schemas.StartReviewSessionDto.properties,
    ).not.toHaveProperty('sessionType');
    expect(answerProperties.hintsUsed.example).toBe(1);
    const createResponses = paths['/api/v1/review-sessions'].post.responses;
    expect(createResponses).toHaveProperty('400');
    expect(createResponses).toHaveProperty('404');
    expect(createResponses).toHaveProperty('409');
    expect(createResponses).toHaveProperty('503');
    expect(createResponses['400'].content['application/json'].example).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'BAD_REQUEST' }),
      }),
    );
    const answerResponses =
      paths['/api/v1/review-sessions/{sessionId}/answers'].post.responses;
    expect(answerResponses).toHaveProperty('400');
    expect(answerResponses).toHaveProperty('404');
    expect(answerResponses).toHaveProperty('409');
    const submittedAnswerProperties =
      response.body.components.schemas.SubmittedReviewAnswerDataDto.properties;
    expect(submittedAnswerProperties).toHaveProperty('agentFeedback');
    expect(
      response.body.components.schemas.ReviewAgentFeedbackDto.properties,
    ).toMatchObject({
      source: { enum: Object.values(ReviewDecisionSource) },
      action: { enum: Object.values(ReviewAgentAction) },
      skillDimension: { enum: Object.values(ReviewSkillDimension) },
      errorType: { enum: Object.values(ReviewErrorType) },
      retestAfterItems: { minimum: 2, maximum: 5 },
    });
  });

  it('returns the Daily Review due count without creating a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reviews/today')
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.dueVocabularyCount).toBe(1);
      });
    await request(app.getHttpServer())
      .get('/api/v1/review-sessions/active')
      .set('Authorization', 'Bearer user-a')
      .expect(404);
  });

  it('creates a Daily Review session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .set('Authorization', 'Bearer user-a')
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.session).not.toHaveProperty('sessionType');
        expect(body.data.nextItem.userVocabularyId).toBe(USER_VOCABULARY_ID);
      });
  });

  it('creates Daily Review, resumes it, answers, and returns its summary', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .set('Authorization', 'Bearer user-a')
      .send({
        limit: 15,
      })
      .expect(201);
    const sessionId = created.body.data.session.id as string;
    expect(JSON.stringify(created.body)).not.toMatch(
      /isCorrect|correctAnswer|answerExplanation|explanation/,
    );

    await request(app.getHttpServer())
      .get('/api/v1/review-sessions/active')
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => expect(body.data.session.id).toBe(sessionId));
    await request(app.getHttpServer())
      .get(`/api/v1/review-sessions/${sessionId}`)
      .set('Authorization', 'Bearer user-a')
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: QUESTION_ID,
        selectedOptionId: OPTION_ID,
        responseTimeMs: 1_200,
        hintsUsed: 0,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          isCorrect: true,
          inferredReviewScore: 4,
          willReturnLater: false,
          sessionCompleted: true,
          progress: { progressPercent: 100 },
          completionSummary: { accuracy: 1 },
        });
      });
    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: QUESTION_ID,
        selectedOptionId: OPTION_ID,
      })
      .expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/review-sessions/${sessionId}/summary`)
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => expect(body.data.answers).toHaveLength(1));
  });

  it('returns an incorrect word later with another question type and completes a correct retry', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .set('Authorization', 'Bearer user-a')
      .send({})
      .expect(201);
    const sessionId = created.body.data.session.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: QUESTION_ID,
        selectedOptionId: WRONG_OPTION_ID,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          isCorrect: false,
          inferredReviewScore: 0,
          willReturnLater: true,
          sessionCompleted: false,
          nextQuestion: {
            id: SESSION_ITEM_ID,
            attemptNumber: 2,
            question: {
              id: RETRY_QUESTION_ID,
              questionType: QuestionType.SELECT_WORD,
            },
          },
          agentFeedback: {
            source: ReviewDecisionSource.AI,
            action: ReviewAgentAction.TEACH_AND_REQUEUE,
            skillDimension: ReviewSkillDimension.CONTEXT,
            errorType: ReviewErrorType.CONFUSABLE_WORD,
            retestAfterItems: 3,
          },
        });
        expect(body.data.agentFeedback.microLesson).toMatchObject({
          title: 'Contrast the meanings',
        });
      });

    await request(app.getHttpServer())
      .get(`/api/v1/review-sessions/${sessionId}`)
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.nextItem.question.questionType).toBe(
          QuestionType.SELECT_WORD,
        );
      });

    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: RETRY_QUESTION_ID,
        selectedOptionId: OPTION_ID,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          isCorrect: true,
          inferredReviewScore: 2,
          willReturnLater: false,
          sessionCompleted: true,
        });
      });
  });

  it('completes after a second failure and lowers a first-attempt score when a hint was used', async () => {
    const failed = await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .set('Authorization', 'Bearer user-a')
      .send({})
      .expect(201);
    const failedSessionId = failed.body.data.session.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${failedSessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: QUESTION_ID,
        selectedOptionId: WRONG_OPTION_ID,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${failedSessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: RETRY_QUESTION_ID,
        selectedOptionId: WRONG_OPTION_ID,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          isCorrect: false,
          inferredReviewScore: 0,
          sessionCompleted: true,
        });
      });

    const hinted = await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .set('Authorization', 'Bearer user-b')
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${hinted.body.data.session.id}/answers`)
      .set('Authorization', 'Bearer user-b')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: QUESTION_ID,
        selectedOptionId: OPTION_ID,
        hintsUsed: 1,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.inferredReviewScore).toBe(3);
      });
  });

  it('skips the active item transaction contract and summarizes it as incorrect', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .set('Authorization', 'Bearer user-a')
      .send({})
      .expect(201);
    const sessionId = created.body.data.session.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/skip`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: QUESTION_ID,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          inferredReviewScore: 0,
          sessionCompleted: true,
          completionSummary: { score: 0, accuracy: 0 },
        });
      });
    await request(app.getHttpServer())
      .get(`/api/v1/review-sessions/${sessionId}/summary`)
      .set('Authorization', 'Bearer user-a')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.result.accuracy).toBe(0);
        expect(body.data.answers).toHaveLength(0);
      });
  });

  it('enforces ownership, active-item identity, validation, and abandon state', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .set('Authorization', 'Bearer user-a')
      .send({})
      .expect(201);
    const sessionId = created.body.data.session.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/review-sessions/${sessionId}`)
      .set('Authorization', 'Bearer user-b')
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        reviewQuestionId: QUESTION_ID,
        selectedOptionId: OPTION_ID,
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/answers`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: QUESTION_ID,
        selectedOptionId: OPTION_ID,
        attemptNumber: 1,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/abandon`)
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/review-sessions/${sessionId}/skip`)
      .set('Authorization', 'Bearer user-a')
      .send({
        reviewSessionItemId: SESSION_ITEM_ID,
        reviewQuestionId: QUESTION_ID,
      })
      .expect(409);
  });

  it('requires authentication on the review APIs', async () => {
    await request(app.getHttpServer()).get('/api/v1/reviews/today').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/review-sessions')
      .send({})
      .expect(401);
  });
});
