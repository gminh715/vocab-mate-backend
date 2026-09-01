import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../src/database/prisma.service';
import { AiService } from '../../../../src/modules/ai/services/ai.service';
import { TutorCandidateService } from '../../../../src/modules/tutor/services/tutor-candidate.service';
import { TutorFsrsService } from '../../../../src/modules/tutor/services/tutor-fsrs.service';
import { TutorRatingService } from '../../../../src/modules/tutor/services/tutor-rating.service';
import { TutorResponseMapper } from '../../../../src/modules/tutor/services/tutor-response.mapper';
import { TutorService } from '../../../../src/modules/tutor/services/tutor.service';

interface PrismaMock {
  tutorSession: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  tutorSessionItem: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  userVocabulary: {
    count: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
}

interface AiServiceMock {
  generateTutorActivity: jest.Mock;
}

interface CandidateServiceMock {
  getCandidatePool: jest.Mock;
  countNewVocab: jest.Mock;
}

describe('TutorService', () => {
  let service: TutorService;
  let prisma: PrismaMock;
  let aiService: AiServiceMock;
  let candidateService: CandidateServiceMock;

  const mockSession = {
    id: 'session-uuid-1',
    userId: 'user-uuid-1',
    studyDate: new Date('2026-08-30T00:00:00.000Z'),
    status: 'ACTIVE',
    targetDurationMinutes: 10,
    targetActivityCount: 5,
    newWordTarget: 1,
    startedAt: new Date('2026-08-30T10:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-08-30T10:00:00.000Z'),
    updatedAt: new Date('2026-08-30T10:00:00.000Z'),
    items: [],
  };

  const mockPendingItem = {
    id: 'item-uuid-1',
    sessionId: 'session-uuid-1',
    userVocabularyId: 'vocab-uuid-1',
    position: 1,
    status: 'PENDING',
    questionType: 'MULTIPLE_CHOICE',
    isNewWord: true,
    questionPayload: {
      questionPromptVi: 'Chọn nghĩa đúng',
      wordDisplay: 'harmful',
      meaningVi: 'có hại',
      options: [
        { id: 'A', text: 'có hại' },
        { id: 'B', text: 'có lợi' },
      ],
    },
    gradingSpec: {
      correctAnswer: 'A',
      explanationVi: 'harmful nghĩa là có hại',
      feedbackCorrectVi: 'Chính xác!',
      feedbackIncorrectVi: 'Chưa chính xác.',
    },
    userAnswer: null,
    isCorrect: null,
    hintUsed: false,
    responseTimeMs: null,
    fsrsRating: null,
    feedbackVi: null,
    generatedAt: new Date('2026-08-30T10:00:00.000Z'),
    answeredAt: null,
  };

  const mockUserVocab = {
    id: 'vocab-uuid-1',
    userId: 'user-uuid-1',
    articleSentenceTermId: 'term-uuid-1',
    savedWordDisplay: 'harmful',
    savedLemma: 'harmful',
    savedPartOfSpeech: 'adjective',
    savedCefrLevel: 'B1',
    savedMeaningVi: 'có hại',
    savedExamples: [],
    fsrsState: 'NEW',
    fsrsStability: null,
    fsrsDifficulty: null,
    fsrsScheduledDays: 0,
    fsrsLearningSteps: 0,
    reviewCount: 0,
    lapseCount: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
  };

  beforeEach(async () => {
    prisma = {
      tutorSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tutorSessionItem: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      userVocabulary: {
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: PrismaMock) => Promise<unknown>) =>
        cb(prisma),
      ),
    };

    aiService = {
      generateTutorActivity: jest.fn(),
    };

    candidateService = {
      getCandidatePool: jest.fn(),
      countNewVocab: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TutorService,
        TutorFsrsService,
        TutorRatingService,
        TutorResponseMapper,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
        { provide: TutorCandidateService, useValue: candidateService },
      ],
    }).compile();

    service = module.get<TutorService>(TutorService);
  });

  describe('getTodayStatus', () => {
    it('returns canStart = true when no session exists and user has vocabulary', async () => {
      prisma.tutorSession.findUnique.mockResolvedValue(null);
      prisma.userVocabulary.count
        .mockResolvedValueOnce(3) // dueCount
        .mockResolvedValueOnce(10); // totalVocabCount

      const result = await service.getTodayStatus('user-uuid-1');

      expect(result.canStart).toBe(true);
      expect(result.canResume).toBe(false);
      expect(result.isCompletedToday).toBe(false);
      expect(result.dueCount).toBe(3);
      expect(result.session).toBeNull();
    });

    it('returns canResume = true when an ACTIVE session exists today', async () => {
      prisma.tutorSession.findUnique.mockResolvedValue(mockSession);
      prisma.userVocabulary.count.mockResolvedValue(2);

      const result = await service.getTodayStatus('user-uuid-1');

      expect(result.canStart).toBe(false);
      expect(result.canResume).toBe(true);
      expect(result.isCompletedToday).toBe(false);
      expect(result.session?.id).toBe('session-uuid-1');
    });

    it('returns isCompletedToday = true when session is COMPLETED', async () => {
      prisma.tutorSession.findUnique.mockResolvedValue({
        ...mockSession,
        status: 'COMPLETED',
        completedAt: new Date(),
      });
      prisma.userVocabulary.count.mockResolvedValue(0);

      const result = await service.getTodayStatus('user-uuid-1');

      expect(result.canStart).toBe(false);
      expect(result.canResume).toBe(false);
      expect(result.isCompletedToday).toBe(true);
      expect(result.session?.status).toBe('COMPLETED');
    });
  });

  describe('startOrResumeSession', () => {
    it('returns session summary if today session is already COMPLETED', async () => {
      prisma.tutorSession.findUnique.mockResolvedValue({
        ...mockSession,
        status: 'COMPLETED',
        items: [{ ...mockPendingItem, status: 'ANSWERED', isCorrect: true }],
      });
      prisma.userVocabulary.count.mockResolvedValue(2);

      const result = await service.startOrResumeSession('user-uuid-1');
      expect(result.session.status).toBe('COMPLETED');
      expect(result.currentItem).toBeNull();
      expect(result.summary).toBeDefined();
    });

    it('resumes ACTIVE session and returns existing PENDING item without calling AI', async () => {
      prisma.tutorSession.findUnique.mockResolvedValue({
        ...mockSession,
        items: [mockPendingItem],
      });

      const result = await service.startOrResumeSession('user-uuid-1');

      expect(result.session.id).toBe('session-uuid-1');
      expect(result.currentItem?.id).toBe('item-uuid-1');
      expect(result.currentItem?.questionPayload).toBeDefined();
      expect(aiService.generateTutorActivity).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if user has 0 saved vocabulary', async () => {
      prisma.tutorSession.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ dailyStudyMinutes: 10 });
      prisma.userVocabulary.count.mockResolvedValue(0);
      candidateService.countNewVocab.mockResolvedValue(0);

      await expect(service.startOrResumeSession('user-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a new session and generates first question via AI', async () => {
      prisma.tutorSession.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ dailyStudyMinutes: 10 });
      prisma.userVocabulary.count.mockResolvedValue(5);
      candidateService.countNewVocab.mockResolvedValue(5);
      candidateService.getCandidatePool.mockResolvedValue([
        {
          id: 'vocab-uuid-1',
          savedWordDisplay: 'harmful',
          savedLemma: 'harmful',
          savedPartOfSpeech: 'adjective',
          savedCefrLevel: 'B1',
          savedMeaningVi: 'có hại',
          savedExamples: [],
          fsrsState: 'NEW',
        },
      ]);

      prisma.tutorSession.create.mockResolvedValue({
        ...mockSession,
        targetActivityCount: 13,
        newWordTarget: 3,
        items: [],
      });

      aiService.generateTutorActivity.mockResolvedValue({
        selectedCandidateId: 'vocab-uuid-1',
        questionType: 'MULTIPLE_CHOICE',
        questionPromptVi: 'Chọn nghĩa đúng',
        explanationVi: 'harmful nghĩa là có hại',
        feedbackCorrectVi: 'Chính xác!',
        feedbackIncorrectVi: 'Chưa chính xác.',
        options: [
          { id: 'A', text: 'có hại' },
          { id: 'B', text: 'có lợi' },
          { id: 'C', text: 'nhanh' },
          { id: 'D', text: 'chậm' },
        ],
        correctOptionId: 'A',
      });

      prisma.tutorSessionItem.create.mockResolvedValue(mockPendingItem);

      const result = await service.startOrResumeSession('user-uuid-1');

      expect(prisma.tutorSession.create).toHaveBeenCalled();
      expect(aiService.generateTutorActivity).toHaveBeenCalled();
      expect(prisma.tutorSessionItem.create).toHaveBeenCalled();
      expect(result.session.id).toBe('session-uuid-1');
      expect(result.currentItem?.id).toBe('item-uuid-1');
    });
  });

  describe('submitAnswer', () => {
    it('throws NotFoundException if session does not exist', async () => {
      prisma.tutorSession.findFirst.mockResolvedValue(null);

      await expect(
        service.submitAnswer('user-uuid-1', 'session-uuid-1', 'item-uuid-1', {
          answer: 'A',
          hintUsed: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if session is not ACTIVE', async () => {
      prisma.tutorSession.findFirst.mockResolvedValue({
        ...mockSession,
        status: 'COMPLETED',
        items: [mockPendingItem],
      });

      await expect(
        service.submitAnswer('user-uuid-1', 'session-uuid-1', 'item-uuid-1', {
          answer: 'A',
          hintUsed: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('is idempotent: returns existing answered item if already answered', async () => {
      const answeredItem = {
        ...mockPendingItem,
        status: 'ANSWERED',
        userAnswer: 'A',
        isCorrect: true,
        fsrsRating: 2,
        feedbackVi: 'Chính xác!',
        answeredAt: new Date(),
      };

      prisma.tutorSession.findFirst.mockResolvedValue({
        ...mockSession,
        items: [answeredItem],
      });

      const result = await service.submitAnswer(
        'user-uuid-1',
        'session-uuid-1',
        'item-uuid-1',
        { answer: 'A', hintUsed: false },
      );

      expect(result.item.id).toBe('item-uuid-1');
      expect(result.item.isCorrect).toBe(true);
      expect(prisma.userVocabulary.update).not.toHaveBeenCalled();
    });

    it('grades MULTIPLE_CHOICE correctly and updates FSRS card in transaction', async () => {
      prisma.tutorSession.findFirst.mockResolvedValue({
        ...mockSession,
        items: [mockPendingItem],
      });
      prisma.userVocabulary.findUnique.mockResolvedValue(mockUserVocab);
      prisma.tutorSessionItem.update.mockResolvedValue({
        ...mockPendingItem,
        status: 'ANSWERED',
        userAnswer: 'A',
        isCorrect: true,
        fsrsRating: 2,
        feedbackVi: 'Chính xác!',
        answeredAt: new Date(),
      });

      const result = await service.submitAnswer(
        'user-uuid-1',
        'session-uuid-1',
        'item-uuid-1',
        { answer: 'A', hintUsed: false, responseTimeMs: 4000 },
      );

      expect(result.item.isCorrect).toBe(true);
      expect(result.item.correctAnswer).toBe('A');
      expect(prisma.userVocabulary.update).toHaveBeenCalled();
      expect(prisma.tutorSessionItem.update).toHaveBeenCalled();
    });

    it('grades case-insensitively for typed/cloze questions', async () => {
      const clozeItem = {
        ...mockPendingItem,
        questionType: 'CONTEXTUAL_CLOZE',
        gradingSpec: {
          correctAnswer: 'beneficial',
          explanationVi: 'beneficial nghĩa là có lợi',
          feedbackCorrectVi: 'Chính xác!',
          feedbackIncorrectVi: 'Chưa chính xác.',
        },
      };

      prisma.tutorSession.findFirst.mockResolvedValue({
        ...mockSession,
        items: [clozeItem],
      });
      prisma.userVocabulary.findUnique.mockResolvedValue(mockUserVocab);
      prisma.tutorSessionItem.update.mockResolvedValue({
        ...clozeItem,
        status: 'ANSWERED',
        userAnswer: '  BENEFICIAL  ',
        isCorrect: true,
        fsrsRating: 3,
        feedbackVi: 'Chính xác!',
        answeredAt: new Date(),
      });

      const result = await service.submitAnswer(
        'user-uuid-1',
        'session-uuid-1',
        'item-uuid-1',
        { answer: '  BENEFICIAL  ', hintUsed: false },
      );

      expect(result.item.isCorrect).toBe(true);
    });

    it('completes session when targetActivityCount is reached', async () => {
      const sessionWithAlmostDone = {
        ...mockSession,
        targetActivityCount: 2,
        items: [
          { ...mockPendingItem, id: 'item-0', status: 'ANSWERED' },
          mockPendingItem,
        ],
      };

      prisma.tutorSession.findFirst.mockResolvedValue(sessionWithAlmostDone);
      prisma.userVocabulary.findUnique.mockResolvedValue(mockUserVocab);
      prisma.tutorSessionItem.update.mockResolvedValue({
        ...mockPendingItem,
        status: 'ANSWERED',
        userAnswer: 'A',
        isCorrect: true,
        fsrsRating: 2,
        answeredAt: new Date(),
      });
      prisma.tutorSession.update.mockResolvedValue({
        ...sessionWithAlmostDone,
        status: 'COMPLETED',
      });

      const result = await service.submitAnswer(
        'user-uuid-1',
        'session-uuid-1',
        'item-uuid-1',
        { answer: 'A', hintUsed: false },
      );

      expect(result.isSessionCompleted).toBe(true);
      expect(result.sessionStatus).toBe('COMPLETED');
      expect(prisma.tutorSession.update).toHaveBeenCalledWith({
        where: { id: 'session-uuid-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }) as unknown,
      });
    });
  });

  describe('abandonSession', () => {
    it('marks session ABANDONED and any PENDING items SKIPPED', async () => {
      prisma.tutorSession.findFirst.mockResolvedValue({
        ...mockSession,
        items: [mockPendingItem],
      });
      prisma.tutorSession.update.mockResolvedValue({
        ...mockSession,
        status: 'ABANDONED',
        completedAt: new Date(),
      });
      prisma.userVocabulary.count.mockResolvedValue(2);

      const result = await service.abandonSession(
        'user-uuid-1',
        'session-uuid-1',
      );

      expect(result.session.status).toBe('ABANDONED');
      expect(prisma.tutorSessionItem.updateMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-uuid-1', status: 'PENDING' },
        data: { status: 'SKIPPED' },
      });
    });
  });

  describe('getHistory', () => {
    it('returns sessions ordered by date and cursor-based pagination', async () => {
      prisma.tutorSession.findMany.mockResolvedValue([mockSession]);

      const result = await service.getHistory('user-uuid-1', { limit: 20 });

      expect(result.items.length).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('getSessionDetail', () => {
    it('returns all items with correct answers exposed for answered items', async () => {
      const answeredItem = {
        ...mockPendingItem,
        status: 'ANSWERED',
        userAnswer: 'A',
        isCorrect: true,
        fsrsRating: 2,
        feedbackVi: 'Chính xác!',
        answeredAt: new Date(),
      };

      prisma.tutorSession.findFirst.mockResolvedValue({
        ...mockSession,
        status: 'COMPLETED',
        completedAt: new Date(),
        items: [answeredItem],
      });
      prisma.userVocabulary.count.mockResolvedValue(0);

      const result = await service.getSessionDetail(
        'user-uuid-1',
        'session-uuid-1',
      );

      expect(result.session.id).toBe('session-uuid-1');
      expect(result.items.length).toBe(1);
      expect(result.items[0].correctAnswer).toBe('A');
      expect(result.items[0].explanationVi).toBe('harmful nghĩa là có hại');
      expect(result.summary).toBeDefined();
    });
  });
});
