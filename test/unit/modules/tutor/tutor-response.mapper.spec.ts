import { Test, TestingModule } from '@nestjs/testing';
import type {
  TutorSession,
  TutorSessionItem,
} from '../../../../generated/prisma/client';
import { TutorResponseMapper } from '../../../../src/modules/tutor/services/tutor-response.mapper';

describe('TutorResponseMapper', () => {
  let mapper: TutorResponseMapper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TutorResponseMapper],
    }).compile();

    mapper = module.get<TutorResponseMapper>(TutorResponseMapper);
  });

  const mockSession: TutorSession = {
    id: 'session-1',
    userId: 'user-1',
    studyDate: new Date('2026-08-30T00:00:00.000Z'),
    status: 'ACTIVE',
    targetDurationMinutes: 10,
    targetActivityCount: 10,
    newWordTarget: 2,
    startedAt: new Date('2026-08-30T10:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-08-30T10:00:00.000Z'),
    updatedAt: new Date('2026-08-30T10:00:00.000Z'),
  };

  const mockPendingItem: TutorSessionItem = {
    id: 'item-1',
    sessionId: 'session-1',
    userVocabularyId: 'vocab-1',
    position: 1,
    status: 'PENDING',
    questionType: 'MULTIPLE_CHOICE',
    isNewWord: true,
    questionPayload: {
      questionPromptVi: 'Chọn nghĩa đúng',
      wordDisplay: 'beneficial',
      meaningVi: 'có lợi',
      options: [
        { id: 'A', text: 'có lợi' },
        { id: 'B', text: 'có hại' },
      ],
    },
    gradingSpec: {
      correctAnswer: 'A',
      explanationVi: 'beneficial nghĩa là có lợi',
      feedbackCorrectVi: 'Chính xác!',
      feedbackIncorrectVi: 'Chưa đúng.',
    },
    userAnswer: null,
    isCorrect: null,
    hintUsed: false,
    responseTimeMs: null,
    fsrsRating: null,
    feedbackVi: null,
    generatedAt: new Date('2026-08-30T10:00:01.000Z'),
    answeredAt: null,
  };

  const mockAnsweredItem: TutorSessionItem = {
    ...mockPendingItem,
    id: 'item-2',
    position: 2,
    status: 'ANSWERED',
    userAnswer: 'A',
    isCorrect: true,
    hintUsed: false,
    responseTimeMs: 3500,
    fsrsRating: 2, // Hard for MC
    feedbackVi: 'Chính xác!',
    answeredAt: new Date('2026-08-30T10:00:05.000Z'),
  };

  describe('mapSessionSummary', () => {
    it('formats studyDate as YYYY-MM-DD', () => {
      const summary = mapper.mapSessionSummary(mockSession);
      expect(summary.id).toBe('session-1');
      expect(summary.studyDate).toBe('2026-08-30');
      expect(summary.status).toBe('ACTIVE');
      expect(summary.targetActivityCount).toBe(10);
    });
  });

  describe('mapPendingItem', () => {
    it('NEVER exposes gradingSpec or correct answers in pending items', () => {
      const pendingDto = mapper.mapPendingItem(mockPendingItem);
      expect(pendingDto.id).toBe('item-1');
      expect(pendingDto.status).toBe('PENDING');
      expect(pendingDto.questionPayload).toBeDefined();
      expect(
        (pendingDto as unknown as Record<string, unknown>).gradingSpec,
      ).toBeUndefined();
      expect(
        (pendingDto as unknown as Record<string, unknown>).correctAnswer,
      ).toBeUndefined();
      expect(
        (pendingDto as unknown as Record<string, unknown>).explanationVi,
      ).toBeUndefined();
    });
  });

  describe('mapAnsweredItem', () => {
    it('safely exposes correctAnswer and explanationVi after answered', () => {
      const answeredDto = mapper.mapAnsweredItem(mockAnsweredItem);
      expect(answeredDto.id).toBe('item-2');
      expect(answeredDto.status).toBe('ANSWERED');
      expect(answeredDto.isCorrect).toBe(true);
      expect(answeredDto.correctAnswer).toBe('A');
      expect(answeredDto.explanationVi).toBe('beneficial nghĩa là có lợi');
      expect(answeredDto.feedbackVi).toBe('Chính xác!');
      expect(answeredDto.fsrsRating).toBe(2);
    });
  });

  describe('calculateSummaryStats', () => {
    it('calculates deterministic summary statistics', () => {
      const completedSession: TutorSession = {
        ...mockSession,
        status: 'COMPLETED',
        completedAt: new Date('2026-08-30T10:05:00.000Z'), // 300s duration
      };

      const items: TutorSessionItem[] = [
        mockAnsweredItem,
        {
          ...mockAnsweredItem,
          id: 'item-3',
          position: 3,
          isNewWord: false,
          isCorrect: false,
          fsrsRating: 1, // Again
          questionPayload: { wordDisplay: 'detrimental' },
        },
      ];

      const stats = mapper.calculateSummaryStats(completedSession, items, 5);

      expect(stats.durationSeconds).toBe(300);
      expect(stats.plannedActivities).toBe(10);
      expect(stats.completedActivities).toBe(2);
      expect(stats.correctCount).toBe(1);
      expect(stats.incorrectCount).toBe(1);
      expect(stats.newWordsStudied).toBe(1);
      expect(stats.reviewWordsStudied).toBe(1);
      expect(stats.ratingDistribution).toEqual({
        again: 1,
        hard: 1,
        good: 0,
        easy: 0,
      });
      expect(stats.relearningWords).toEqual(['detrimental']);
      expect(stats.nextDueCount).toBe(5);
    });
  });
});
