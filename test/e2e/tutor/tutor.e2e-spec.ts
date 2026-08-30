import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  CefrLevel,
  FsrsCardState,
  TutorQuestionType,
  TutorSessionItemStatus,
  TutorSessionStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { AuthenticatedUserThrottlerGuard } from '../../../src/common/guards/authenticated-user-throttler.guard';
import type { AuthConfig } from '../../../src/config/auth.config';
import { AUTH_CONFIG } from '../../../src/config/config.module';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  TutorQuestionInput,
  TutorQuestionResult,
} from '../../../src/modules/ai/ai.contracts';
import { AiService } from '../../../src/modules/ai/services/ai.service';
import type { RequestWithUser } from '../../../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { TutorFsrsService } from '../../../src/modules/tutor/services/tutor-fsrs.service';

const authConfig: AuthConfig = {
  accessSecret: 'e2e-access-secret-at-least-32-characters',
  accessExpiresInSeconds: 900,
  refreshSecret: 'e2e-refresh-secret-at-least-32-characters',
  refreshExpiresInSeconds: 604800,
  bcryptRounds: 4,
  cookieSecure: false,
  cookieSameSite: 'lax',
};

const USER_A_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const USER_B_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const VOCAB_1_ID = '11111111-1111-4111-8111-111111111111';
const VOCAB_2_ID = '22222222-2222-4222-8222-222222222222';
const VOCAB_3_ID = '33333333-3333-4333-8333-333333333333';
const TERM_1_ID = '91919191-9191-4191-8191-919191919191';
const TERM_2_ID = '92929292-9292-4292-8292-929292929292';
const TERM_3_ID = '93939393-9393-4393-8393-939393939393';
const SENTENCE_1_ID = '81818181-8181-4181-8181-818181818181';

interface StoredUser {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  dailyStudyMinutes: number;
}

interface StoredUserVocabulary {
  id: string;
  userId: string;
  articleSentenceTermId: string;
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedIpa: string | null;
  savedCefrLevel: CefrLevel;
  savedMeaningVi: string;
  definitionEn: string | null;
  savedExamples: unknown;
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  fsrsState: FsrsCardState;
  fsrsStability: number | null;
  fsrsDifficulty: number | null;
  fsrsScheduledDays: number;
  fsrsLearningSteps: number;
  reviewCount: number;
  lapseCount: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  articleSentenceTerm: {
    sentenceId: string;
  };
}

interface StoredTutorSession {
  id: string;
  userId: string;
  studyDate: Date;
  status: TutorSessionStatus;
  targetDurationMinutes: number;
  targetActivityCount: number;
  newWordTarget: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredTutorSessionItem {
  id: string;
  sessionId: string;
  userVocabularyId: string | null;
  position: number;
  status: TutorSessionItemStatus;
  questionType: TutorQuestionType;
  isNewWord: boolean;
  questionPayload: Record<string, unknown>;
  gradingSpec: Record<string, unknown>;
  userAnswer: unknown;
  isCorrect: boolean | null;
  hintUsed: boolean;
  responseTimeMs: number | null;
  fsrsRating: number | null;
  feedbackVi: string | null;
  generatedAt: Date;
  answeredAt: Date | null;
}

class InMemoryTutorDatabase {
  users = new Map<string, StoredUser>();
  userVocabularies = new Map<string, StoredUserVocabulary>();
  tutorSessions = new Map<string, StoredTutorSession>();
  tutorSessionItems = new Map<string, StoredTutorSessionItem>();

  reset() {
    this.users.clear();
    this.userVocabularies.clear();
    this.tutorSessions.clear();
    this.tutorSessionItems.clear();
  }

  seedDefaultData() {
    this.users.set(USER_A_ID, {
      id: USER_A_ID,
      email: 'user-a@example.com',
      role: UserRole.USER,
      status: 'ACTIVE',
      dailyStudyMinutes: 10,
    });

    this.users.set(USER_B_ID, {
      id: USER_B_ID,
      email: 'user-b@example.com',
      role: UserRole.USER,
      status: 'ACTIVE',
      dailyStudyMinutes: 10,
    });

    this.userVocabularies.set(VOCAB_1_ID, {
      id: VOCAB_1_ID,
      userId: USER_A_ID,
      articleSentenceTermId: TERM_1_ID,
      savedWordDisplay: 'harmful',
      savedLemma: 'harmful',
      savedPartOfSpeech: 'adjective',
      savedIpa: '/ˈhɑːrmfəl/',
      savedCefrLevel: CefrLevel.B1,
      savedMeaningVi: 'có hại',
      definitionEn: 'causing damage',
      savedExamples: [],
      savedAt: new Date('2026-08-01T00:00:00Z'),
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-01T00:00:00Z'),
      fsrsState: 'NEW',
      fsrsStability: null,
      fsrsDifficulty: null,
      fsrsScheduledDays: 0,
      fsrsLearningSteps: 0,
      reviewCount: 0,
      lapseCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      articleSentenceTerm: { sentenceId: SENTENCE_1_ID },
    });

    this.userVocabularies.set(VOCAB_2_ID, {
      id: VOCAB_2_ID,
      userId: USER_A_ID,
      articleSentenceTermId: TERM_2_ID,
      savedWordDisplay: 'sustainable',
      savedLemma: 'sustainable',
      savedPartOfSpeech: 'adjective',
      savedIpa: '/səˈsteɪnəbəl/',
      savedCefrLevel: CefrLevel.B2,
      savedMeaningVi: 'bền vững',
      definitionEn: 'able to be maintained',
      savedExamples: [],
      savedAt: new Date('2026-08-02T00:00:00Z'),
      createdAt: new Date('2026-08-02T00:00:00Z'),
      updatedAt: new Date('2026-08-02T00:00:00Z'),
      fsrsState: 'REVIEW',
      fsrsStability: 5.0,
      fsrsDifficulty: 4.5,
      fsrsScheduledDays: 5,
      fsrsLearningSteps: 0,
      reviewCount: 3,
      lapseCount: 0,
      lastReviewedAt: new Date('2026-08-25T00:00:00Z'),
      nextReviewAt: new Date('2026-08-30T00:00:00Z'),
      articleSentenceTerm: { sentenceId: SENTENCE_1_ID },
    });

    this.userVocabularies.set(VOCAB_3_ID, {
      id: VOCAB_3_ID,
      userId: USER_B_ID,
      articleSentenceTermId: TERM_3_ID,
      savedWordDisplay: 'pollution',
      savedLemma: 'pollution',
      savedPartOfSpeech: 'noun',
      savedIpa: '/pəˈluːʃən/',
      savedCefrLevel: CefrLevel.B1,
      savedMeaningVi: 'sự ô nhiễm',
      definitionEn: 'presence of harmful substances',
      savedExamples: [],
      savedAt: new Date('2026-08-01T00:00:00Z'),
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-01T00:00:00Z'),
      fsrsState: 'NEW',
      fsrsStability: null,
      fsrsDifficulty: null,
      fsrsScheduledDays: 0,
      fsrsLearningSteps: 0,
      reviewCount: 0,
      lapseCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      articleSentenceTerm: { sentenceId: SENTENCE_1_ID },
    });
  }
}

class TestTutorAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/u, '');
    if (!token || ![USER_A_ID, USER_B_ID, 'admin'].includes(token)) {
      throw new UnauthorizedException('Access token is invalid');
    }
    request.user = {
      id: token === 'admin' ? USER_A_ID : token,
      email: `${token}@example.com`,
      role: token === 'admin' ? UserRole.ADMIN : UserRole.USER,
      status: 'ACTIVE',
    };
    return true;
  }
}

interface SuccessBody<T> {
  success: true;
  data: T;
}

interface ErrorBody {
  success: false;
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

interface SessionSummaryDto {
  id: string;
  userId: string;
  studyDate: string;
  status: string;
  targetDurationMinutes: number;
  targetActivityCount: number;
  newWordTarget: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PendingItemDto {
  id: string;
  sessionId: string;
  userVocabularyId: string | null;
  position: number;
  status: string;
  questionType: string;
  isNewWord: boolean;
  questionPayload: {
    wordDisplay?: string;
    questionPromptVi?: string;
    meaningVi?: string;
    options?: Array<{ id: string; text: string }>;
    [key: string]: unknown;
  };
  hintUsed: boolean;
  gradingSpec?: unknown;
  correctAnswer?: unknown;
  isCorrect?: unknown;
  generatedAt: string;
}

interface AnsweredItemDto extends PendingItemDto {
  userAnswer: unknown;
  isCorrect: boolean;
  responseTimeMs: number | null;
  fsrsRating: number | null;
  feedbackVi: string | null;
  correctAnswer: unknown;
  explanationVi: string | null;
  answeredAt: string | null;
}

interface SessionWithItemData {
  session: SessionSummaryDto;
  currentItem: PendingItemDto | null;
  summary: {
    durationSeconds: number;
    plannedActivities: number;
    completedActivities: number;
    correctCount: number;
    incorrectCount: number;
    newWordsStudied: number;
    reviewWordsStudied: number;
    ratingDistribution: {
      again: number;
      hard: number;
      good: number;
      easy: number;
    };
    relearningWords: string[];
    nextDueCount: number;
  } | null;
}

interface TodayStatusData {
  canStart: boolean;
  canResume: boolean;
  isCompletedToday: boolean;
  isAbandoned: boolean;
  dueCount: number;
  session: SessionSummaryDto | null;
}

interface SubmitAnswerData {
  item: AnsweredItemDto;
  sessionStatus: string;
  isSessionCompleted: boolean;
}

interface HistoryData {
  items: SessionSummaryDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface SessionDetailData {
  session: SessionSummaryDto;
  items: AnsweredItemDto[];
  summary: {
    durationSeconds: number;
    plannedActivities: number;
    completedActivities: number;
    correctCount: number;
    incorrectCount: number;
  } | null;
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

describe('Tutor API (e2e)', () => {
  let app: INestApplication<App>;
  let db: InMemoryTutorDatabase;
  let mockAiService: { generateTutorActivity: jest.Mock };
  let tutorFsrsService: TutorFsrsService;
  let studyDateSpy: jest.SpyInstance;

  beforeAll(async () => {
    db = new InMemoryTutorDatabase();
    mockAiService = {
      generateTutorActivity: jest.fn(),
    };

    const prismaMock = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => {
          return Promise.resolve(db.users.get(where.id) ?? null);
        }),
      },
      userVocabulary: {
        count: jest.fn(
          ({
            where,
          }: {
            where?: {
              userId?: string;
              fsrsState?: string | { in: string[] };
              nextReviewAt?: { lte: Date };
            };
          }) => {
            let rows = [...db.userVocabularies.values()];
            if (where?.userId) {
              rows = rows.filter((r) => r.userId === where.userId);
            }
            if (where?.fsrsState) {
              if (typeof where.fsrsState === 'string') {
                const targetState = where.fsrsState;
                rows = rows.filter((r) => r.fsrsState === targetState);
              } else if (where.fsrsState?.in) {
                const targetStates = where.fsrsState.in;
                rows = rows.filter((r) => targetStates.includes(r.fsrsState));
              }
            }
            if (where?.nextReviewAt?.lte) {
              const lteDate = where.nextReviewAt.lte;
              rows = rows.filter(
                (r) => r.nextReviewAt && r.nextReviewAt <= lteDate,
              );
            }
            return Promise.resolve(rows.length);
          },
        ),
        findUnique: jest.fn(({ where }: { where: { id: string } }) => {
          return Promise.resolve(db.userVocabularies.get(where.id) ?? null);
        }),
        findMany: jest.fn(
          ({
            where,
            take,
          }: {
            where?: {
              userId?: string;
              fsrsState?: string | { in: string[] };
              nextReviewAt?: { lte: Date };
            };
            take?: number;
          }) => {
            let rows = [...db.userVocabularies.values()];
            if (where?.userId) {
              rows = rows.filter((r) => r.userId === where.userId);
            }
            if (where?.fsrsState) {
              if (typeof where.fsrsState === 'string') {
                const targetState = where.fsrsState;
                rows = rows.filter((r) => r.fsrsState === targetState);
              } else if (where.fsrsState?.in) {
                const targetStates = where.fsrsState.in;
                rows = rows.filter((r) => targetStates.includes(r.fsrsState));
              }
            }
            if (where?.nextReviewAt?.lte) {
              const lteDate = where.nextReviewAt.lte;
              rows = rows.filter(
                (r) => r.nextReviewAt && r.nextReviewAt <= lteDate,
              );
            }
            if (take) {
              rows = rows.slice(0, take);
            }
            return Promise.resolve(rows);
          },
        ),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<StoredUserVocabulary>;
          }) => {
            const existing = db.userVocabularies.get(where.id);
            if (!existing) throw new Error('Not found');
            const updated: StoredUserVocabulary = {
              ...existing,
              ...data,
              updatedAt: new Date(),
            };
            db.userVocabularies.set(where.id, updated);
            return Promise.resolve(updated);
          },
        ),
      },
      tutorSession: {
        findUnique: jest.fn(
          ({
            where,
            include,
          }: {
            where: {
              userId_studyDate?: { userId: string; studyDate: Date };
              id?: string;
            };
            include?: { items?: boolean };
          }) => {
            let session: StoredTutorSession | undefined;
            if (where.userId_studyDate) {
              const { userId, studyDate } = where.userId_studyDate;
              session = [...db.tutorSessions.values()].find(
                (s) =>
                  s.userId === userId &&
                  s.studyDate.toISOString().slice(0, 10) ===
                    studyDate.toISOString().slice(0, 10),
              );
            } else if (where.id) {
              session = db.tutorSessions.get(where.id);
            }
            if (!session) return Promise.resolve(null);

            if (include?.items) {
              const items = [...db.tutorSessionItems.values()]
                .filter((item) => item.sessionId === session.id)
                .sort((a, b) => a.position - b.position);
              return Promise.resolve({ ...session, items });
            }
            return Promise.resolve(session);
          },
        ),
        findFirst: jest.fn(
          ({
            where,
            include,
          }: {
            where: { id?: string; userId?: string };
            include?: { items?: boolean };
          }) => {
            const session = [...db.tutorSessions.values()].find((s) => {
              if (where.id && s.id !== where.id) return false;
              if (where.userId && s.userId !== where.userId) return false;
              return true;
            });
            if (!session) return Promise.resolve(null);

            if (include?.items) {
              const items = [...db.tutorSessionItems.values()]
                .filter((item) => item.sessionId === session.id)
                .sort((a, b) => a.position - b.position);
              return Promise.resolve({ ...session, items });
            }
            return Promise.resolve(session);
          },
        ),
        findMany: jest.fn(
          ({
            where,
            take,
          }: {
            where?: { userId?: string; OR?: unknown[] };
            take?: number;
          }) => {
            let list = [...db.tutorSessions.values()].filter(
              (s) => !where?.userId || s.userId === where.userId,
            );
            list.sort(
              (a, b) =>
                b.studyDate.getTime() - a.studyDate.getTime() ||
                b.id.localeCompare(a.id),
            );
            if (take) {
              list = list.slice(0, take);
            }
            return Promise.resolve(list);
          },
        ),
        create: jest.fn(
          ({
            data,
            include,
          }: {
            data: {
              userId: string;
              studyDate: Date;
              status?: TutorSessionStatus;
              targetDurationMinutes: number;
              targetActivityCount: number;
              newWordTarget: number;
            };
            include?: { items?: boolean };
          }) => {
            const studyDateStr = data.studyDate.toISOString().slice(0, 10);
            const exists = [...db.tutorSessions.values()].some(
              (s) =>
                s.userId === data.userId &&
                s.studyDate.toISOString().slice(0, 10) === studyDateStr,
            );
            if (exists) {
              const err = new Error('Unique constraint failed') as Error & {
                code?: string;
              };
              err.code = 'P2002';
              throw err;
            }

            const id = randomUUID();
            const now = new Date();
            const session: StoredTutorSession = {
              id,
              userId: data.userId,
              studyDate: data.studyDate,
              status: data.status ?? 'ACTIVE',
              targetDurationMinutes: data.targetDurationMinutes,
              targetActivityCount: data.targetActivityCount,
              newWordTarget: data.newWordTarget,
              startedAt: now,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
            };
            db.tutorSessions.set(id, session);
            if (include?.items) {
              return Promise.resolve({ ...session, items: [] });
            }
            return Promise.resolve(session);
          },
        ),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<StoredTutorSession>;
          }) => {
            const session = db.tutorSessions.get(where.id);
            if (!session) throw new Error('Not found');
            const updated: StoredTutorSession = {
              ...session,
              ...data,
              updatedAt: new Date(),
            };
            db.tutorSessions.set(where.id, updated);
            return Promise.resolve(updated);
          },
        ),
      },
      tutorSessionItem: {
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: { sessionId?: string; status?: TutorSessionItemStatus };
          }) => {
            const found =
              [...db.tutorSessionItems.values()].find((item) => {
                if (where.sessionId && item.sessionId !== where.sessionId)
                  return false;
                if (where.status && item.status !== where.status) return false;
                return true;
              }) ?? null;
            return Promise.resolve(found);
          },
        ),
        findMany: jest.fn(({ where }: { where: { sessionId?: string } }) => {
          const list = [...db.tutorSessionItems.values()].filter((item) => {
            if (where.sessionId && item.sessionId !== where.sessionId)
              return false;
            return true;
          });
          return Promise.resolve(list);
        }),
        create: jest.fn(
          ({
            data,
          }: {
            data: {
              sessionId: string;
              userVocabularyId?: string | null;
              position: number;
              status?: TutorSessionItemStatus;
              questionType: TutorQuestionType;
              isNewWord: boolean;
              questionPayload: Record<string, unknown>;
              gradingSpec: Record<string, unknown>;
              hintUsed?: boolean;
            };
          }) => {
            const hasPending = [...db.tutorSessionItems.values()].some(
              (i) => i.sessionId === data.sessionId && i.status === 'PENDING',
            );
            if (hasPending && data.status === 'PENDING') {
              const err = new Error(
                'Partial unique pending constraint',
              ) as Error & { code?: string };
              err.code = 'P2002';
              throw err;
            }

            const id = randomUUID();
            const now = new Date();
            const item: StoredTutorSessionItem = {
              id,
              sessionId: data.sessionId,
              userVocabularyId: data.userVocabularyId ?? null,
              position: data.position,
              status: data.status ?? 'PENDING',
              questionType: data.questionType,
              isNewWord: data.isNewWord,
              questionPayload: data.questionPayload,
              gradingSpec: data.gradingSpec,
              userAnswer: null,
              isCorrect: null,
              hintUsed: data.hintUsed ?? false,
              responseTimeMs: null,
              fsrsRating: null,
              feedbackVi: null,
              generatedAt: now,
              answeredAt: null,
            };
            db.tutorSessionItems.set(id, item);
            return Promise.resolve(item);
          },
        ),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<StoredTutorSessionItem>;
          }) => {
            const item = db.tutorSessionItems.get(where.id);
            if (!item) throw new Error('Not found');
            const updated: StoredTutorSessionItem = { ...item, ...data };
            db.tutorSessionItems.set(where.id, updated);
            return Promise.resolve(updated);
          },
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: { sessionId?: string; status?: TutorSessionItemStatus };
            data: Partial<StoredTutorSessionItem>;
          }) => {
            let count = 0;
            for (const item of db.tutorSessionItems.values()) {
              if (where.sessionId && item.sessionId !== where.sessionId)
                continue;
              if (where.status && item.status !== where.status) continue;
              Object.assign(item, data);
              count++;
            }
            return Promise.resolve({ count });
          },
        ),
      },
      $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) => {
        return callback(prismaMock);
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(authConfig)
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(AiService)
      .useValue(mockAiService)
      .overrideGuard(JwtAuthGuard)
      .useClass(TestTutorAuthGuard)
      .overrideGuard(AuthenticatedUserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    tutorFsrsService = moduleFixture.get<TutorFsrsService>(TutorFsrsService);

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  beforeEach(() => {
    db.reset();
    db.seedDefaultData();
    jest.clearAllMocks();

    if (studyDateSpy) {
      studyDateSpy.mockRestore();
    }
    studyDateSpy = jest
      .spyOn(tutorFsrsService, 'getStudyDate')
      .mockReturnValue('2026-08-30');

    // Dynamic mock AI generator responding to candidate & questionType
    mockAiService.generateTutorActivity.mockImplementation(
      (input: TutorQuestionInput) => {
        const candidate = input.candidates[0];
        const type = input.questionType;

        if (type === 'MULTIPLE_CHOICE') {
          return Promise.resolve({
            selectedCandidateId: candidate.id,
            questionType: 'MULTIPLE_CHOICE',
            questionPromptVi: `Chọn nghĩa đúng của từ ${candidate.wordDisplay}:`,
            explanationVi: `${candidate.wordDisplay} có nghĩa là ${candidate.meaningVi}`,
            feedbackCorrectVi: `Chính xác! ${candidate.wordDisplay} = ${candidate.meaningVi}`,
            feedbackIncorrectVi: `Chưa đúng. ${candidate.wordDisplay} = ${candidate.meaningVi}`,
            options: [
              { id: 'A', text: candidate.meaningVi },
              { id: 'B', text: 'nghĩa sai 1' },
              { id: 'C', text: 'nghĩa sai 2' },
              { id: 'D', text: 'nghĩa sai 3' },
            ],
            correctOptionId: 'A',
          } as TutorQuestionResult);
        }

        if (type === 'CONTEXTUAL_CLOZE') {
          return Promise.resolve({
            selectedCandidateId: candidate.id,
            questionType: 'CONTEXTUAL_CLOZE',
            questionPromptVi: 'Điền từ thích hợp vào chỗ trống:',
            explanationVi: `${candidate.wordDisplay} = ${candidate.meaningVi}`,
            feedbackCorrectVi: 'Chính xác!',
            feedbackIncorrectVi: 'Chưa đúng!',
            sentenceWithBlank: 'This is a ___ example.',
            canonicalAnswer: candidate.lemma || candidate.wordDisplay,
          } as TutorQuestionResult);
        }

        if (type === 'TYPED_RECALL') {
          return Promise.resolve({
            selectedCandidateId: candidate.id,
            questionType: 'TYPED_RECALL',
            questionPromptVi: `Gõ từ tiếng Anh có nghĩa là "${candidate.meaningVi}":`,
            explanationVi: `${candidate.wordDisplay} = ${candidate.meaningVi}`,
            feedbackCorrectVi: 'Chính xác!',
            feedbackIncorrectVi: 'Chưa đúng!',
            recallPromptVi: candidate.meaningVi,
            canonicalAnswer: candidate.lemma || candidate.wordDisplay,
          } as TutorQuestionResult);
        }

        // MICRO_LESSON_RETEST
        return Promise.resolve({
          selectedCandidateId: candidate.id,
          questionType: 'MICRO_LESSON_RETEST',
          questionPromptVi: 'Đọc bài học ngắn và trả lời câu hỏi:',
          explanationVi: `${candidate.wordDisplay} = ${candidate.meaningVi}`,
          feedbackCorrectVi: 'Chính xác!',
          feedbackIncorrectVi: 'Chưa đúng!',
          microLessonVi: `Từ ${candidate.wordDisplay} (${candidate.partOfSpeech}) nghĩa là ${candidate.meaningVi}.`,
          retestType: 'TYPED_RECALL',
          recallPromptVi: candidate.meaningVi,
          canonicalAnswer: candidate.lemma || candidate.wordDisplay,
        } as TutorQuestionResult);
      },
    );
  });

  afterAll(async () => {
    if (studyDateSpy) {
      studyDateSpy.mockRestore();
    }
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Swagger documentation verification
  // ---------------------------------------------------------------------------
  describe('Swagger Documentation', () => {
    it('publishes all 6 documented Tutor endpoints with BearerAuth security', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      const swagger = responseBody<{
        paths: Record<
          string,
          Record<
            string,
            {
              operationId: string;
              responses: Record<string, object>;
              security?: Array<Record<string, string[]>>;
            }
          >
        >;
      }>(response);

      const paths = swagger.paths;

      // GET /api/v1/tutor-sessions/today
      expect(paths['/api/v1/tutor-sessions/today']?.get).toBeDefined();
      expect(paths['/api/v1/tutor-sessions/today'].get.operationId).toBe(
        'getTodayTutorStatus',
      );
      expect(paths['/api/v1/tutor-sessions/today'].get.security).toContainEqual(
        {
          BearerAuth: [],
        },
      );

      // POST /api/v1/tutor-sessions
      expect(paths['/api/v1/tutor-sessions']?.post).toBeDefined();
      expect(paths['/api/v1/tutor-sessions'].post.operationId).toBe(
        'startOrResumeTutorSession',
      );

      // GET /api/v1/tutor-sessions/history
      expect(paths['/api/v1/tutor-sessions/history']?.get).toBeDefined();
      expect(paths['/api/v1/tutor-sessions/history'].get.operationId).toBe(
        'getTutorHistory',
      );

      // GET /api/v1/tutor-sessions/{sessionId}
      expect(paths['/api/v1/tutor-sessions/{sessionId}']?.get).toBeDefined();
      expect(paths['/api/v1/tutor-sessions/{sessionId}'].get.operationId).toBe(
        'getTutorSession',
      );

      // GET /api/v1/tutor-sessions/{sessionId}/detail
      expect(
        paths['/api/v1/tutor-sessions/{sessionId}/detail']?.get,
      ).toBeDefined();
      expect(
        paths['/api/v1/tutor-sessions/{sessionId}/detail'].get.operationId,
      ).toBe('getTutorSessionDetail');

      // POST /api/v1/tutor-sessions/{sessionId}/items/{itemId}/answers
      expect(
        paths['/api/v1/tutor-sessions/{sessionId}/items/{itemId}/answers']
          ?.post,
      ).toBeDefined();
      expect(
        paths['/api/v1/tutor-sessions/{sessionId}/items/{itemId}/answers'].post
          .operationId,
      ).toBe('submitTutorItemAnswer');

      // POST /api/v1/tutor-sessions/{sessionId}/abandon
      expect(
        paths['/api/v1/tutor-sessions/{sessionId}/abandon']?.post,
      ).toBeDefined();
      expect(
        paths['/api/v1/tutor-sessions/{sessionId}/abandon'].post.operationId,
      ).toBe('abandonTutorSession');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Authentication & Authorization Security
  // ---------------------------------------------------------------------------
  describe('Authentication & Authorization Security', () => {
    it('rejects unauthenticated requests on all tutor endpoints with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/today')
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/history')
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/11111111-1111-4111-8111-111111111111')
        .expect(401);

      await request(app.getHttpServer())
        .get(
          '/api/v1/tutor-sessions/11111111-1111-4111-8111-111111111111/detail',
        )
        .expect(401);

      await request(app.getHttpServer())
        .post(
          '/api/v1/tutor-sessions/11111111-1111-4111-8111-111111111111/items/22222222-2222-4222-8222-222222222222/answers',
        )
        .send({ answer: 'A', hintUsed: false })
        .expect(401);

      await request(app.getHttpServer())
        .post(
          '/api/v1/tutor-sessions/11111111-1111-4111-8111-111111111111/abandon',
        )
        .expect(401);
    });

    it('rejects cross-user access to another user session with 404 (owner-scoped)', async () => {
      // User A starts a session
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const userASessionId = startBody.data.session.id;
      const userAItemId = startBody.data.currentItem?.id;

      // User B tries to view User A session
      await request(app.getHttpServer())
        .get(`/api/v1/tutor-sessions/${userASessionId}`)
        .set('Authorization', `Bearer ${USER_B_ID}`)
        .expect(404);

      // User B tries to view User A session detail
      await request(app.getHttpServer())
        .get(`/api/v1/tutor-sessions/${userASessionId}/detail`)
        .set('Authorization', `Bearer ${USER_B_ID}`)
        .expect(404);

      // User B tries to submit answer to User A session
      await request(app.getHttpServer())
        .post(
          `/api/v1/tutor-sessions/${userASessionId}/items/${userAItemId}/answers`,
        )
        .set('Authorization', `Bearer ${USER_B_ID}`)
        .send({ answer: 'A', hintUsed: false })
        .expect(404);

      // User B tries to abandon User A session
      await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${userASessionId}/abandon`)
        .set('Authorization', `Bearer ${USER_B_ID}`)
        .expect(404);
    });

    it('rejects unexpected request fields (strip/validation rules)', async () => {
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;
      const itemId = startBody.data.currentItem?.id;

      // Body with illegal fields: userId, gradingSpec, isCorrect
      await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/items/${itemId}/answers`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .send({
          answer: 'A',
          hintUsed: false,
          userId: USER_B_ID,
          gradingSpec: { correctAnswer: 'B' },
          isCorrect: true,
        })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Today status endpoint (GET /today)
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/tutor-sessions/today', () => {
    it('returns canStart=false if user has zero saved vocabularies', async () => {
      // Clear user vocabularies for User A
      for (const [id, v] of db.userVocabularies.entries()) {
        if (v.userId === USER_A_ID) {
          db.userVocabularies.delete(id);
        }
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/today')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const body = responseBody<SuccessBody<TodayStatusData>>(res);
      expect(body.success).toBe(true);
      expect(body.data.canStart).toBe(false);
      expect(body.data.canResume).toBe(false);
      expect(body.data.isCompletedToday).toBe(false);
      expect(body.data.session).toBeNull();
    });

    it('returns canStart=true when user has saved vocabularies and no session today', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/today')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const body = responseBody<SuccessBody<TodayStatusData>>(res);
      expect(body.success).toBe(true);
      expect(body.data.canStart).toBe(true);
      expect(body.data.canResume).toBe(false);
      expect(body.data.isCompletedToday).toBe(false);
      expect(body.data.dueCount).toBe(1); // VOCAB_2 is REVIEW and due
    });

    it('returns canResume=true when session is ACTIVE', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/today')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const body = responseBody<SuccessBody<TodayStatusData>>(res);
      expect(body.success).toBe(true);
      expect(body.data.canStart).toBe(false);
      expect(body.data.canResume).toBe(true);
      expect(body.data.isCompletedToday).toBe(false);
      expect(body.data.session?.status).toBe('ACTIVE');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Session lifecycle: Start, Answer-Key Privacy, Resume, Abandon, Completion
  // ---------------------------------------------------------------------------
  describe('Session Lifecycle & Privacy (Start, Resume, Abandon, Complete)', () => {
    it('creates a session and returns a PENDING item without exposing gradingSpec or correctAnswer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const body = responseBody<SuccessBody<SessionWithItemData>>(res);
      expect(body.success).toBe(true);
      const session = body.data.session;
      const currentItem = body.data.currentItem;

      expect(session.status).toBe('ACTIVE');
      expect(session.studyDate).toBe('2026-08-30');
      expect(session.targetDurationMinutes).toBe(10);
      expect(session.targetActivityCount).toBe(13); // 10 min * 60 / 45s = 13
      expect(session.newWordTarget).toBe(3); // 13 * 0.2 = 2.6 -> 3

      // CRITICAL INVARIANT: Answer key must NOT be leaked
      expect(currentItem).toBeDefined();
      expect(currentItem?.status).toBe('PENDING');
      expect(currentItem?.gradingSpec).toBeUndefined();
      expect(currentItem?.correctAnswer).toBeUndefined();
      expect(currentItem?.isCorrect).toBeUndefined();
      expect(currentItem?.questionPayload).toBeDefined();
      expect(currentItem?.questionPayload.wordDisplay).toBeDefined();
    });

    it('resumes existing ACTIVE session without calling AI service again', async () => {
      // First start
      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const firstBody =
        responseBody<SuccessBody<SessionWithItemData>>(firstRes);
      const firstSessionId = firstBody.data.session.id;
      const firstItemId = firstBody.data.currentItem?.id;
      expect(mockAiService.generateTutorActivity).toHaveBeenCalledTimes(1);

      // Second start attempt (resume)
      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const secondBody =
        responseBody<SuccessBody<SessionWithItemData>>(secondRes);
      expect(secondBody.data.session.id).toBe(firstSessionId);
      expect(secondBody.data.currentItem?.id).toBe(firstItemId);
      // AI service should NOT be called again
      expect(mockAiService.generateTutorActivity).toHaveBeenCalledTimes(1);
    });

    it('retrieves active session state via GET /api/v1/tutor-sessions/:sessionId', async () => {
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/tutor-sessions/${sessionId}`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const getBody = responseBody<SuccessBody<SessionWithItemData>>(getRes);
      expect(getBody.success).toBe(true);
      expect(getBody.data.session.id).toBe(sessionId);
      expect(getBody.data.currentItem?.status).toBe('PENDING');
      expect(getBody.data.currentItem?.correctAnswer).toBeUndefined();
    });

    it('abandons an active session and prevents starting another session on the same day', async () => {
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;

      // Abandon session
      const abandonRes = await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/abandon`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const abandonBody =
        responseBody<SuccessBody<SessionWithItemData>>(abandonRes);
      expect(abandonBody.success).toBe(true);
      expect(abandonBody.data.session.status).toBe('ABANDONED');
      expect(abandonBody.data.summary).toBeDefined();

      // Verify pending item is marked as SKIPPED
      const pendingItems = [...db.tutorSessionItems.values()].filter(
        (i) => i.sessionId === sessionId && i.status === 'SKIPPED',
      );
      expect(pendingItems.length).toBeGreaterThanOrEqual(1);

      // Attempting to start another session today must fail with 409 Conflict
      const secondStart = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(409);

      const secondBody = responseBody<ErrorBody>(secondStart);
      expect(secondBody.success).toBe(false);

      // Today status should reflect isAbandoned=true
      const todayRes = await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/today')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const todayBody = responseBody<SuccessBody<TodayStatusData>>(todayRes);
      expect(todayBody.data.isAbandoned).toBe(true);
      expect(todayBody.data.canStart).toBe(false);
      expect(todayBody.data.canResume).toBe(false);
    });

    it('allows starting a new session when studyDate advances (timezone boundary simulation)', async () => {
      // Day 1: User completes or abandons session
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${startBody.data.session.id}/abandon`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      // Advance study date to next day in Asia/Ho_Chi_Minh
      studyDateSpy.mockReturnValue('2026-08-31');

      // Now starting a session for the new date should succeed
      const newDayStart = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const newDayBody =
        responseBody<SuccessBody<SessionWithItemData>>(newDayStart);
      expect(newDayBody.success).toBe(true);
      expect(newDayBody.data.session.studyDate).toBe('2026-08-31');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Deterministic Grading, Answer Submission, FSRS Updates & Idempotency
  // ---------------------------------------------------------------------------
  describe('Deterministic Grading & FSRS Updates', () => {
    it('grades multiple choice correctly, applies Hard ceiling, and reveals correctAnswer in response', async () => {
      // Set only NEW word for User A so questionType is MULTIPLE_CHOICE
      db.userVocabularies.delete(VOCAB_2_ID);

      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;
      const itemId = startBody.data.currentItem?.id;
      expect(startBody.data.currentItem?.questionType).toBe('MULTIPLE_CHOICE');

      // Submit correct answer 'A'
      const answerRes = await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/items/${itemId}/answers`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .send({
          answer: 'A',
          hintUsed: false,
          responseTimeMs: 3500,
        })
        .expect(200);

      const answerBody = responseBody<SuccessBody<SubmitAnswerData>>(answerRes);
      expect(answerBody.success).toBe(true);
      const item = answerBody.data.item;

      expect(item.status).toBe('ANSWERED');
      expect(item.isCorrect).toBe(true);
      expect(item.userAnswer).toBe('A');
      // MULTIPLE_CHOICE correct ceiling is Hard (rating 2 in ts-fsrs)
      expect(item.fsrsRating).toBe(2);
      expect(item.correctAnswer).toBe('A');
      expect(item.explanationVi).toBe('harmful có nghĩa là có hại');

      // Verify UserVocabulary was scheduled & updated in database
      const updatedVocab = db.userVocabularies.get(VOCAB_1_ID);
      expect(updatedVocab?.reviewCount).toBe(1);
      expect(updatedVocab?.lastReviewedAt).toBeDefined();
      expect(updatedVocab?.nextReviewAt).toBeDefined();
    });

    it('grades wrong answer as Again (rating 1) and retains failure feedback', async () => {
      // Set only NEW word for User A
      db.userVocabularies.delete(VOCAB_2_ID);

      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;
      const itemId = startBody.data.currentItem?.id;

      // Submit incorrect answer 'B'
      const answerRes = await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/items/${itemId}/answers`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .send({
          answer: 'B',
          hintUsed: false,
          responseTimeMs: 4000,
        })
        .expect(200);

      const answerBody = responseBody<SuccessBody<SubmitAnswerData>>(answerRes);
      expect(answerBody.success).toBe(true);
      const item = answerBody.data.item;

      expect(item.isCorrect).toBe(false);
      // Incorrect answer must be rated Again (rating 1 in ts-fsrs)
      expect(item.fsrsRating).toBe(1);
      expect(item.correctAnswer).toBe('A');
    });

    it('grades typed answer with case-insensitivity and whitespace trimming (no fuzzy matching)', async () => {
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;
      const itemId = startBody.data.currentItem?.id;

      // Submit with extra spaces and uppercase letters: "  SuStAiNaBlE  "
      const answerRes = await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/items/${itemId}/answers`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .send({
          answer: '  SuStAiNaBlE  ',
          hintUsed: false,
          responseTimeMs: 3000,
        })
        .expect(200);

      const answerBody = responseBody<SuccessBody<SubmitAnswerData>>(answerRes);
      expect(answerBody.data.item.isCorrect).toBe(true);
      // VOCAB_2 has state=REVIEW, reviewCount=3, responseTimeMs=3000 (<5s), no hint -> rating is Easy (4)
      expect(answerBody.data.item.fsrsRating).toBe(4);
    });

    it('demotes rating to Hard when hintUsed is true or response is slow (>= 30s)', async () => {
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;
      const itemId = startBody.data.currentItem?.id;

      // Correct answer with hintUsed = true
      const answerRes = await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/items/${itemId}/answers`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .send({
          answer: 'sustainable',
          hintUsed: true,
          responseTimeMs: 2000,
        })
        .expect(200);

      const answerBody = responseBody<SuccessBody<SubmitAnswerData>>(answerRes);
      expect(answerBody.data.item.isCorrect).toBe(true);
      expect(answerBody.data.item.fsrsRating).toBe(2); // Hard
    });

    it('handles idempotent retries: submitting same answer again returns answered item without double updating', async () => {
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;
      const itemId = startBody.data.currentItem?.id;

      // First submit
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/items/${itemId}/answers`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .send({ answer: 'sustainable', hintUsed: false, responseTimeMs: 2000 })
        .expect(200);

      const body1 = responseBody<SuccessBody<SubmitAnswerData>>(res1);
      const initialReviewCount =
        db.userVocabularies.get(VOCAB_2_ID)?.reviewCount;
      expect(initialReviewCount).toBe(4); // was 3, incremented to 4

      // Second submit of the exact same item
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/items/${itemId}/answers`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .send({ answer: 'sustainable', hintUsed: false, responseTimeMs: 2000 })
        .expect(200);

      const body2 = responseBody<SuccessBody<SubmitAnswerData>>(res2);
      expect(body2.data.item.id).toBe(body1.data.item.id);
      expect(body2.data.item.status).toBe('ANSWERED');

      // Verify FSRS reviewCount did not increment again
      expect(db.userVocabularies.get(VOCAB_2_ID)?.reviewCount).toBe(
        initialReviewCount,
      );
    });

    it('completes the session when targetActivityCount is reached', async () => {
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/tutor-sessions')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const startBody =
        responseBody<SuccessBody<SessionWithItemData>>(startRes);
      const sessionId = startBody.data.session.id;
      const session = db.tutorSessions.get(sessionId);
      expect(session).toBeDefined();

      // Set targetActivityCount to 1 for quick completion test
      if (session) {
        session.targetActivityCount = 1;
      }
      const itemId = startBody.data.currentItem?.id;

      const answerRes = await request(app.getHttpServer())
        .post(`/api/v1/tutor-sessions/${sessionId}/items/${itemId}/answers`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .send({ answer: 'sustainable', hintUsed: false, responseTimeMs: 2000 })
        .expect(200);

      const answerBody = responseBody<SuccessBody<SubmitAnswerData>>(answerRes);
      expect(answerBody.data.isSessionCompleted).toBe(true);
      expect(answerBody.data.sessionStatus).toBe('COMPLETED');
      expect(db.tutorSessions.get(sessionId)?.status).toBe('COMPLETED');

      // GET /today now reports isCompletedToday=true
      const todayRes = await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/today')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const todayBody = responseBody<SuccessBody<TodayStatusData>>(todayRes);
      expect(todayBody.data.isCompletedToday).toBe(true);
      expect(todayBody.data.canStart).toBe(false);
      expect(todayBody.data.canResume).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. History and Session Detail endpoints
  // ---------------------------------------------------------------------------
  describe('History and Session Detail', () => {
    it('returns paginated tutor sessions strictly scoped to the requesting user', async () => {
      // Seed a completed session for User A
      const sessionA: StoredTutorSession = {
        id: randomUUID(),
        userId: USER_A_ID,
        studyDate: new Date('2026-08-28T00:00:00Z'),
        status: 'COMPLETED',
        targetDurationMinutes: 10,
        targetActivityCount: 5,
        newWordTarget: 1,
        startedAt: new Date('2026-08-28T10:00:00Z'),
        completedAt: new Date('2026-08-28T10:10:00Z'),
        createdAt: new Date('2026-08-28T10:00:00Z'),
        updatedAt: new Date('2026-08-28T10:10:00Z'),
      };
      db.tutorSessions.set(sessionA.id, sessionA);

      // Seed a completed session for User B
      const sessionB: StoredTutorSession = {
        id: randomUUID(),
        userId: USER_B_ID,
        studyDate: new Date('2026-08-28T00:00:00Z'),
        status: 'COMPLETED',
        targetDurationMinutes: 10,
        targetActivityCount: 5,
        newWordTarget: 1,
        startedAt: new Date('2026-08-28T10:00:00Z'),
        completedAt: new Date('2026-08-28T10:10:00Z'),
        createdAt: new Date('2026-08-28T10:00:00Z'),
        updatedAt: new Date('2026-08-28T10:10:00Z'),
      };
      db.tutorSessions.set(sessionB.id, sessionB);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tutor-sessions/history?limit=10')
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const body = responseBody<SuccessBody<HistoryData>>(res);
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].id).toBe(sessionA.id);
      expect(body.data.items[0].userId).toBe(USER_A_ID);
    });

    it('returns full session detail with all answered items and explanations for review', async () => {
      const sessionId = randomUUID();
      const session: StoredTutorSession = {
        id: sessionId,
        userId: USER_A_ID,
        studyDate: new Date('2026-08-29T00:00:00Z'),
        status: 'COMPLETED',
        targetDurationMinutes: 10,
        targetActivityCount: 1,
        newWordTarget: 1,
        startedAt: new Date('2026-08-29T10:00:00Z'),
        completedAt: new Date('2026-08-29T10:05:00Z'),
        createdAt: new Date('2026-08-29T10:00:00Z'),
        updatedAt: new Date('2026-08-29T10:05:00Z'),
      };
      db.tutorSessions.set(sessionId, session);

      const itemId = randomUUID();
      const item: StoredTutorSessionItem = {
        id: itemId,
        sessionId,
        userVocabularyId: VOCAB_1_ID,
        position: 1,
        status: 'ANSWERED',
        questionType: 'MULTIPLE_CHOICE',
        isNewWord: true,
        questionPayload: {
          wordDisplay: 'harmful',
          questionPromptVi: 'Chọn nghĩa đúng',
          options: [{ id: 'A', text: 'có hại' }],
        },
        gradingSpec: {
          correctAnswer: 'A',
          explanationVi: 'harmful = có hại',
        },
        userAnswer: 'A',
        isCorrect: true,
        hintUsed: false,
        responseTimeMs: 3000,
        fsrsRating: 2,
        feedbackVi: 'Chính xác!',
        generatedAt: new Date('2026-08-29T10:00:00Z'),
        answeredAt: new Date('2026-08-29T10:01:00Z'),
      };
      db.tutorSessionItems.set(itemId, item);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tutor-sessions/${sessionId}/detail`)
        .set('Authorization', `Bearer ${USER_A_ID}`)
        .expect(200);

      const body = responseBody<SuccessBody<SessionDetailData>>(res);
      expect(body.success).toBe(true);
      expect(body.data.session.id).toBe(sessionId);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].correctAnswer).toBe('A');
      expect(body.data.items[0].explanationVi).toBe('harmful = có hại');
      expect(body.data.summary).toBeDefined();
      expect(body.data.summary?.completedActivities).toBe(1);
      expect(body.data.summary?.correctCount).toBe(1);
    });
  });
});
