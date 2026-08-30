import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type FsrsCardState,
  type TutorQuestionType,
} from '../../../../generated/prisma/enums';
import type {
  TutorSession,
  TutorSessionItem,
} from '../../../../generated/prisma/client';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type {
  TutorQuestionCandidate,
  TutorQuestionInput,
  TutorQuestionResult,
} from '../../ai/ai.contracts';
import { AiService } from '../../ai/services/ai.service';
import { TutorHistoryQueryDto } from '../dto/history-query.dto';
import {
  SubmitAnswerResponseDataDto,
  TutorSessionAnsweredItemDto,
  TutorSessionPendingItemDto,
} from '../dto/session-item-response.dto';
import {
  TutorSessionDetailDataDto,
  TutorSessionSummaryDto,
  TutorSessionWithItemDataDto,
} from '../dto/session-response.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import { TodayStatusDataDto } from '../dto/today-status-response.dto';
import {
  CandidateVocab,
  TutorCandidateService,
} from './tutor-candidate.service';
import { TutorFsrsService } from './tutor-fsrs.service';
import { TutorRatingService } from './tutor-rating.service';
import { TutorResponseMapper } from './tutor-response.mapper';

interface CursorData {
  studyDate: string;
  id: string;
}

interface GradingSpec {
  correctAnswer: unknown;
  explanationVi: string;
  feedbackCorrectVi: string;
  feedbackIncorrectVi: string;
  retestType?: string;
}

@Injectable()
export class TutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fsrsService: TutorFsrsService,
    private readonly ratingService: TutorRatingService,
    private readonly candidateService: TutorCandidateService,
    private readonly aiService: AiService,
    private readonly responseMapper: TutorResponseMapper,
  ) {}

  /**
   * Returns readiness and status of today's tutor session.
   */
  async getTodayStatus(userId: string): Promise<TodayStatusDataDto> {
    const now = new Date();
    const studyDateStr = this.fsrsService.getStudyDate(now);
    const studyDate = new Date(`${studyDateStr}T00:00:00.000Z`);

    const [todaySession, dueCount, totalVocabCount] = await Promise.all([
      this.prisma.tutorSession.findUnique({
        where: {
          userId_studyDate: {
            userId,
            studyDate,
          },
        },
      }),
      this.prisma.userVocabulary.count({
        where: {
          userId,
          fsrsState: { in: ['RELEARNING', 'LEARNING', 'REVIEW'] },
          nextReviewAt: { lte: now },
        },
      }),
      this.prisma.userVocabulary.count({
        where: { userId },
      }),
    ]);

    if (!todaySession) {
      return {
        canStart: totalVocabCount > 0,
        canResume: false,
        isCompletedToday: false,
        isAbandoned: false,
        dueCount,
        session: null,
      };
    }

    const sessionSummary = this.responseMapper.mapSessionSummary(todaySession);

    if (todaySession.status === 'ACTIVE') {
      return {
        canStart: false,
        canResume: true,
        isCompletedToday: false,
        isAbandoned: false,
        dueCount,
        session: sessionSummary,
      };
    }

    if (todaySession.status === 'COMPLETED') {
      return {
        canStart: false,
        canResume: false,
        isCompletedToday: true,
        isAbandoned: false,
        dueCount,
        session: sessionSummary,
      };
    }

    // ABANDONED
    return {
      canStart: false,
      canResume: false,
      isCompletedToday: false,
      isAbandoned: true,
      dueCount,
      session: sessionSummary,
    };
  }

  /**
   * Starts a new tutor session for today or resumes an existing ACTIVE session.
   */
  async startOrResumeSession(
    userId: string,
  ): Promise<TutorSessionWithItemDataDto> {
    const now = new Date();
    const studyDateStr = this.fsrsService.getStudyDate(now);
    const studyDate = new Date(`${studyDateStr}T00:00:00.000Z`);

    // 1. Check existing session for today
    let session = await this.prisma.tutorSession.findUnique({
      where: {
        userId_studyDate: {
          userId,
          studyDate,
        },
      },
      include: {
        items: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (session) {
      if (session.status === 'COMPLETED' || session.status === 'ABANDONED') {
        const dueCount = await this.countDueVocab(userId, now);
        return {
          session: this.responseMapper.mapSessionSummary(session),
          currentItem: null,
          summary: this.responseMapper.calculateSummaryStats(
            session,
            session.items,
            dueCount,
          ),
        };
      }

      // ACTIVE session: check if pending item exists
      const pendingItem = session.items.find((i) => i.status === 'PENDING');
      if (pendingItem) {
        return {
          session: this.responseMapper.mapSessionSummary(session),
          currentItem: this.responseMapper.mapPendingItem(pendingItem),
          summary: null,
        };
      }

      // No pending item: check if quota already met
      const answeredCount = session.items.filter(
        (i) => i.status === 'ANSWERED',
      ).length;
      if (answeredCount >= session.targetActivityCount) {
        const completedSession = await this.prisma.tutorSession.update({
          where: { id: session.id },
          data: { status: 'COMPLETED', completedAt: now },
        });
        const dueCount = await this.countDueVocab(userId, now);
        return {
          session: this.responseMapper.mapSessionSummary(completedSession),
          currentItem: null,
          summary: this.responseMapper.calculateSummaryStats(
            completedSession,
            session.items,
            dueCount,
          ),
        };
      }

      // Generate next item
      const newItem = await this.generateAndPersistNextItem(
        session,
        session.items,
      );
      return {
        session: this.responseMapper.mapSessionSummary(session),
        currentItem: newItem,
        summary: null,
      };
    }

    // 2. Create new session
    const [user, totalVocab, newVocabCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { dailyStudyMinutes: true },
      }),
      this.prisma.userVocabulary.count({ where: { userId } }),
      this.candidateService.countNewVocab(userId),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (totalVocab === 0) {
      throw new BadRequestException(
        'No saved vocabulary found. Please save words from articles before starting a tutor session.',
      );
    }

    const dailyMinutes = user.dailyStudyMinutes ?? 10;
    const targets = this.fsrsService.calcSessionTargets(
      dailyMinutes,
      newVocabCount,
    );

    try {
      session = await this.prisma.tutorSession.create({
        data: {
          userId,
          studyDate,
          status: 'ACTIVE',
          targetDurationMinutes: dailyMinutes,
          targetActivityCount: targets.targetActivityCount,
          newWordTarget: targets.newWordTarget,
        },
        include: {
          items: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error: unknown) {
      // Catch unique constraint race condition and re-query
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        return this.startOrResumeSession(userId);
      }
      throw error;
    }

    // Generate first item
    const firstItem = await this.generateAndPersistNextItem(session, []);

    return {
      session: this.responseMapper.mapSessionSummary(session),
      currentItem: firstItem,
      summary: null,
    };
  }

  /**
   * Retrieves a session by ID with its current active question or summary.
   */
  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<TutorSessionWithItemDataDto> {
    const session = await this.prisma.tutorSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      include: {
        items: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Tutor session not found');
    }

    const now = new Date();
    const dueCount = await this.countDueVocab(userId, now);

    if (session.status === 'COMPLETED' || session.status === 'ABANDONED') {
      return {
        session: this.responseMapper.mapSessionSummary(session),
        currentItem: null,
        summary: this.responseMapper.calculateSummaryStats(
          session,
          session.items,
          dueCount,
        ),
      };
    }

    // ACTIVE: check for PENDING item
    const pendingItem = session.items.find((i) => i.status === 'PENDING');
    if (pendingItem) {
      return {
        session: this.responseMapper.mapSessionSummary(session),
        currentItem: this.responseMapper.mapPendingItem(pendingItem),
        summary: null,
      };
    }

    // No pending item: check if target activity count reached
    const answeredCount = session.items.filter(
      (i) => i.status === 'ANSWERED',
    ).length;
    if (answeredCount >= session.targetActivityCount) {
      const completedSession = await this.prisma.tutorSession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', completedAt: now },
      });
      return {
        session: this.responseMapper.mapSessionSummary(completedSession),
        currentItem: null,
        summary: this.responseMapper.calculateSummaryStats(
          completedSession,
          session.items,
          dueCount,
        ),
      };
    }

    // Generate next item
    const nextItem = await this.generateAndPersistNextItem(
      session,
      session.items,
    );
    return {
      session: this.responseMapper.mapSessionSummary(session),
      currentItem: nextItem,
      summary: null,
    };
  }

  /**
   * Submits an answer for a PENDING item, grades it deterministically,
   * updates the FSRS card atomically, and marks item as ANSWERED.
   */
  async submitAnswer(
    userId: string,
    sessionId: string,
    itemId: string,
    dto: SubmitAnswerDto,
  ): Promise<SubmitAnswerResponseDataDto> {
    const session = await this.prisma.tutorSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      include: {
        items: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Tutor session not found');
    }

    const item = session.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Tutor session item not found');
    }

    // Idempotent retry check: if already answered, return existing result directly
    if (item.status === 'ANSWERED') {
      return {
        item: this.responseMapper.mapAnsweredItem(item),
        sessionStatus: session.status,
        isSessionCompleted: session.status === 'COMPLETED',
      };
    }

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException('Tutor session is not active');
    }

    if (item.status !== 'PENDING') {
      throw new BadRequestException('Item is not pending an answer');
    }

    // 1. Grade the answer deterministically
    const gradingSpec = item.gradingSpec as unknown as GradingSpec;
    const isCorrect = this.gradeAnswer(
      item.questionType,
      dto.answer,
      gradingSpec.correctAnswer,
    );

    // 2. Fetch UserVocabulary and calculate FSRS schedule
    let fsrsRating = 3;
    let userVocabUpdate: ReturnType<
      typeof this.fsrsService.mapCardToUpdate
    > | null = null;
    const now = new Date();

    if (item.userVocabularyId) {
      const userVocab = await this.prisma.userVocabulary.findUnique({
        where: { id: item.userVocabularyId },
      });

      if (userVocab) {
        fsrsRating = this.ratingService.mapToFsrsRating({
          isCorrect,
          hintUsed: dto.hintUsed,
          responseTimeMs: dto.responseTimeMs ?? null,
          questionType: item.questionType,
          fsrsState: userVocab.fsrsState,
          reviewCount: userVocab.reviewCount,
        });

        const card = this.fsrsService.buildFsrsCard(userVocab);
        const schedulingResult = this.fsrsService.scheduleFsrsCard(
          card,
          fsrsRating,
          now,
        );
        userVocabUpdate = this.fsrsService.mapCardToUpdate(
          schedulingResult,
          now,
        );
      }
    }

    const feedbackVi = isCorrect
      ? (gradingSpec.feedbackCorrectVi ?? 'Chính xác!')
      : (gradingSpec.feedbackIncorrectVi ?? 'Chưa chính xác.');

    // 3. Atomically update item, user vocabulary, and session status if finished
    const answeredCount =
      session.items.filter((i) => i.status === 'ANSWERED').length + 1;
    const isSessionCompleted = answeredCount >= session.targetActivityCount;

    const [updatedItem] = await this.prisma.$transaction(async (tx) => {
      if (item.userVocabularyId && userVocabUpdate) {
        await tx.userVocabulary.update({
          where: { id: item.userVocabularyId },
          data: userVocabUpdate,
        });
      }

      const itemRes = await tx.tutorSessionItem.update({
        where: { id: itemId },
        data: {
          status: 'ANSWERED',
          userAnswer: dto.answer as Prisma.InputJsonValue,
          isCorrect,
          hintUsed: dto.hintUsed,
          responseTimeMs: dto.responseTimeMs ?? null,
          fsrsRating,
          feedbackVi,
          answeredAt: now,
        },
      });

      if (isSessionCompleted) {
        await tx.tutorSession.update({
          where: { id: sessionId },
          data: {
            status: 'COMPLETED',
            completedAt: now,
          },
        });
      }

      return [itemRes];
    });

    return {
      item: this.responseMapper.mapAnsweredItem(updatedItem),
      sessionStatus: isSessionCompleted ? 'COMPLETED' : 'ACTIVE',
      isSessionCompleted,
    };
  }

  /**
   * Abandons an active session. Cannot create another session today.
   */
  async abandonSession(
    userId: string,
    sessionId: string,
  ): Promise<TutorSessionWithItemDataDto> {
    const session = await this.prisma.tutorSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      include: {
        items: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Tutor session not found');
    }

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException('Only active sessions can be abandoned');
    }

    const now = new Date();

    const [abandonedSession] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tutorSession.update({
        where: { id: sessionId },
        data: {
          status: 'ABANDONED',
          completedAt: now,
        },
      });

      await tx.tutorSessionItem.updateMany({
        where: {
          sessionId,
          status: 'PENDING',
        },
        data: {
          status: 'SKIPPED',
        },
      });

      return [updated];
    });

    const dueCount = await this.countDueVocab(userId, now);

    return {
      session: this.responseMapper.mapSessionSummary(abandonedSession),
      currentItem: null,
      summary: this.responseMapper.calculateSummaryStats(
        abandonedSession,
        session.items,
        dueCount,
      ),
    };
  }

  /**
   * Returns a paginated list of historical tutor sessions using cursor-based keyset pagination.
   */
  async getHistory(
    userId: string,
    query: TutorHistoryQueryDto,
  ): Promise<{
    items: TutorSessionSummaryDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 20;
    let cursorFilter: Prisma.TutorSessionWhereInput | undefined;

    if (query.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(query.cursor, 'base64').toString('utf-8'),
        ) as CursorData;
        const cursorDate = new Date(`${decoded.studyDate}T00:00:00.000Z`);

        cursorFilter = {
          OR: [
            { studyDate: { lt: cursorDate } },
            {
              studyDate: cursorDate,
              id: { lt: decoded.id },
            },
          ],
        };
      } catch {
        throw new BadRequestException('Invalid pagination cursor');
      }
    }

    const sessions = await this.prisma.tutorSession.findMany({
      where: {
        userId,
        ...cursorFilter,
      },
      orderBy: [{ studyDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = sessions.length > limit;
    const pageSessions = hasMore ? sessions.slice(0, limit) : sessions;

    let nextCursor: string | null = null;
    if (hasMore && pageSessions.length > 0) {
      const lastSession = pageSessions[pageSessions.length - 1];
      const lastDateStr =
        lastSession.studyDate instanceof Date
          ? lastSession.studyDate.toISOString().slice(0, 10)
          : String(lastSession.studyDate).slice(0, 10);

      const cursorObj: CursorData = {
        studyDate: lastDateStr,
        id: lastSession.id,
      };
      nextCursor = Buffer.from(JSON.stringify(cursorObj)).toString('base64');
    }

    return {
      items: pageSessions.map((s) => this.responseMapper.mapSessionSummary(s)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Retrieves full details of a specific session, including all activity items
   * with answers and explanations for history review.
   */
  async getSessionDetail(
    userId: string,
    sessionId: string,
  ): Promise<TutorSessionDetailDataDto> {
    const session = await this.prisma.tutorSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      include: {
        items: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Tutor session not found');
    }

    const dueCount = await this.countDueVocab(userId, new Date());
    const mappedItems = session.items.map((item) =>
      this.responseMapper.mapItem(item),
    ) as TutorSessionAnsweredItemDto[];

    const summary =
      session.status === 'COMPLETED' || session.status === 'ABANDONED'
        ? this.responseMapper.calculateSummaryStats(
            session,
            session.items,
            dueCount,
          )
        : null;

    return {
      session: this.responseMapper.mapSessionSummary(session),
      items: mappedItems,
      summary,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private gradeAnswer(
    questionType: TutorQuestionType,
    userAnswer: unknown,
    correctAnswer: unknown,
  ): boolean {
    if (userAnswer === null || userAnswer === undefined) {
      return false;
    }

    const userStr =
      typeof userAnswer === 'string'
        ? userAnswer
        : typeof userAnswer === 'number'
          ? String(userAnswer)
          : '';
    const correctStr =
      typeof correctAnswer === 'string'
        ? correctAnswer
        : typeof correctAnswer === 'number'
          ? String(correctAnswer)
          : '';

    if (!userStr || !correctStr) {
      return false;
    }

    if (questionType === 'MULTIPLE_CHOICE') {
      return userStr.trim().toUpperCase() === correctStr.trim().toUpperCase();
    }

    // CLOZE, TYPED_RECALL, MICRO_LESSON_RETEST
    const normUser = this.ratingService.normalizeTypedAnswer(userStr);
    const normCorrect = this.ratingService.normalizeTypedAnswer(correctStr);
    return normUser === normCorrect;
  }

  private mapFsrsStateToQuestionType(
    fsrsState: FsrsCardState,
  ): TutorQuestionType {
    switch (fsrsState) {
      case 'NEW':
        return 'MULTIPLE_CHOICE';
      case 'LEARNING':
        return 'CONTEXTUAL_CLOZE';
      case 'REVIEW':
        return 'TYPED_RECALL';
      case 'RELEARNING':
        return 'MICRO_LESSON_RETEST';
      default:
        return 'MULTIPLE_CHOICE';
    }
  }

  private async countDueVocab(userId: string, now: Date): Promise<number> {
    return this.prisma.userVocabulary.count({
      where: {
        userId,
        fsrsState: { in: ['RELEARNING', 'LEARNING', 'REVIEW'] },
        nextReviewAt: { lte: now },
      },
    });
  }

  private async generateAndPersistNextItem(
    session: TutorSession,
    existingItems: TutorSessionItem[],
  ): Promise<TutorSessionPendingItemDto> {
    const nextPosition = existingItems.length + 1;
    const now = new Date();

    // 1. Fetch candidate pool
    const candidates = await this.candidateService.getCandidatePool(
      session.userId,
      now,
    );

    if (candidates.length === 0) {
      throw new BadRequestException(
        'No candidate vocabulary items available for this session',
      );
    }

    // 2. Select target candidate according to quota and priority
    const newWordsSoFar = existingItems.filter((i) => i.isNewWord).length;
    const remainingNewQuota = Math.max(
      0,
      session.newWordTarget - newWordsSoFar,
    );
    const remainingTotalActivities =
      session.targetActivityCount - existingItems.length;

    // Filter candidates to avoid repeating words already tested in this session if alternates exist
    const usedVocabIds = new Set(
      existingItems
        .map((i) => i.userVocabularyId)
        .filter((id): id is string => id !== null),
    );

    const unusedCandidates = candidates.filter((c) => !usedVocabIds.has(c.id));
    const poolToUse =
      unusedCandidates.length > 0 ? unusedCandidates : candidates;

    let selectedCandidate: CandidateVocab;
    if (remainingNewQuota >= remainingTotalActivities) {
      // Must pick a NEW word to fulfill new word quota
      const newCandidate = poolToUse.find((c) => c.fsrsState === 'NEW');
      selectedCandidate = newCandidate ?? poolToUse[0];
    } else {
      // Pick highest priority candidate in pool
      selectedCandidate = poolToUse[0];
    }

    // 3. Determine question type based on candidate's FSRS state
    const questionType = this.mapFsrsStateToQuestionType(
      selectedCandidate.fsrsState,
    );

    // 4. Prepare structured AI request
    const aiCandidate: TutorQuestionCandidate = {
      id: selectedCandidate.id,
      wordDisplay: selectedCandidate.savedWordDisplay,
      lemma: selectedCandidate.savedLemma,
      partOfSpeech: selectedCandidate.savedPartOfSpeech,
      meaningVi: selectedCandidate.savedMeaningVi,
      examples: selectedCandidate.savedExamples,
    };

    const aiInput: TutorQuestionInput = {
      allowlistIds: [selectedCandidate.id],
      candidates: [aiCandidate],
      questionType,
    };

    // 5. Call AI service outside transaction
    const aiResult: TutorQuestionResult =
      await this.aiService.generateTutorActivity(aiInput);

    // 6. Build public question payload & private grading spec
    const { questionPayload, gradingSpec } = this.buildPayloads(
      aiResult,
      selectedCandidate,
    );

    // 7. Persist item to database (re-check race conditions)
    try {
      const persistedItem = await this.prisma.tutorSessionItem.create({
        data: {
          sessionId: session.id,
          userVocabularyId: selectedCandidate.id,
          position: nextPosition,
          status: 'PENDING',
          questionType,
          isNewWord: selectedCandidate.fsrsState === 'NEW',
          questionPayload: questionPayload as unknown as Prisma.InputJsonValue,
          gradingSpec: gradingSpec as unknown as Prisma.InputJsonValue,
          hintUsed: false,
        },
      });

      return this.responseMapper.mapPendingItem(persistedItem);
    } catch (error: unknown) {
      // If a pending item already exists (partial unique constraint P2002), return existing
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const existingPending = await this.prisma.tutorSessionItem.findFirst({
          where: {
            sessionId: session.id,
            status: 'PENDING',
          },
        });
        if (existingPending) {
          return this.responseMapper.mapPendingItem(existingPending);
        }
      }
      throw error;
    }
  }

  private buildPayloads(
    aiResult: TutorQuestionResult,
    candidate: CandidateVocab,
  ): {
    questionPayload: Record<string, unknown>;
    gradingSpec: GradingSpec;
  } {
    const basePayload: Record<string, unknown> = {
      questionPromptVi: aiResult.questionPromptVi,
      wordDisplay: candidate.savedWordDisplay,
      meaningVi: candidate.savedMeaningVi,
    };

    switch (aiResult.questionType) {
      case 'MULTIPLE_CHOICE': {
        const questionPayload = {
          ...basePayload,
          options: aiResult.options,
        };
        const gradingSpec: GradingSpec = {
          correctAnswer: aiResult.correctOptionId,
          explanationVi: aiResult.explanationVi,
          feedbackCorrectVi: aiResult.feedbackCorrectVi,
          feedbackIncorrectVi: aiResult.feedbackIncorrectVi,
        };
        return { questionPayload, gradingSpec };
      }

      case 'CONTEXTUAL_CLOZE': {
        const questionPayload = {
          ...basePayload,
          sentenceWithBlank: aiResult.sentenceWithBlank,
        };
        const gradingSpec: GradingSpec = {
          correctAnswer: aiResult.canonicalAnswer,
          explanationVi: aiResult.explanationVi,
          feedbackCorrectVi: aiResult.feedbackCorrectVi,
          feedbackIncorrectVi: aiResult.feedbackIncorrectVi,
        };
        return { questionPayload, gradingSpec };
      }

      case 'TYPED_RECALL': {
        const questionPayload = {
          ...basePayload,
          recallPromptVi: aiResult.recallPromptVi,
        };
        const gradingSpec: GradingSpec = {
          correctAnswer: aiResult.canonicalAnswer,
          explanationVi: aiResult.explanationVi,
          feedbackCorrectVi: aiResult.feedbackCorrectVi,
          feedbackIncorrectVi: aiResult.feedbackIncorrectVi,
        };
        return { questionPayload, gradingSpec };
      }

      case 'MICRO_LESSON_RETEST': {
        const questionPayload = {
          ...basePayload,
          microLessonVi: aiResult.microLessonVi,
          retestType: aiResult.retestType,
          sentenceWithBlank: aiResult.sentenceWithBlank,
          recallPromptVi: aiResult.recallPromptVi,
        };
        const gradingSpec: GradingSpec = {
          correctAnswer: aiResult.canonicalAnswer,
          explanationVi: aiResult.explanationVi,
          feedbackCorrectVi: aiResult.feedbackCorrectVi,
          feedbackIncorrectVi: aiResult.feedbackIncorrectVi,
          retestType: aiResult.retestType,
        };
        return { questionPayload, gradingSpec };
      }
    }
  }
}
