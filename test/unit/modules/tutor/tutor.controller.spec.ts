import { Test, TestingModule } from '@nestjs/testing';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../../../src/modules/auth/auth.types';
import { TutorController } from '../../../../src/modules/tutor/controllers/tutor.controller';
import { TutorService } from '../../../../src/modules/tutor/services/tutor.service';
import type {
  TutorSessionDetailDataDto,
  TutorSessionWithItemDataDto,
} from '../../../../src/modules/tutor/dto/session-response.dto';
import type { SubmitAnswerResponseDataDto } from '../../../../src/modules/tutor/dto/session-item-response.dto';
import type { TodayStatusDataDto } from '../../../../src/modules/tutor/dto/today-status-response.dto';
import type { TutorHistoryDataDto } from '../../../../src/modules/tutor/dto/history-query.dto';

interface TutorServiceMock {
  getTodayStatus: jest.Mock;
  startOrResumeSession: jest.Mock;
  getSession: jest.Mock;
  getSessionDetail: jest.Mock;
  submitAnswer: jest.Mock;
  abandonSession: jest.Mock;
  getHistory: jest.Mock;
}

describe('TutorController', () => {
  let controller: TutorController;
  let tutorService: TutorServiceMock;

  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
  };

  beforeEach(async () => {
    tutorService = {
      getTodayStatus: jest.fn(),
      startOrResumeSession: jest.fn(),
      getSession: jest.fn(),
      getSessionDetail: jest.fn(),
      submitAnswer: jest.fn(),
      abandonSession: jest.fn(),
      getHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TutorController],
      providers: [{ provide: TutorService, useValue: tutorService }],
    }).compile();

    controller = module.get<TutorController>(TutorController);
  });

  it('delegates getTodayStatus to service with authenticated userId', async () => {
    const mockToday: TodayStatusDataDto = {
      canStart: true,
      canResume: false,
      isCompletedToday: false,
      isAbandoned: false,
      dueCount: 0,
      session: null,
    };
    tutorService.getTodayStatus.mockResolvedValue(mockToday);
    const result = await controller.getTodayStatus(mockUser);
    expect(tutorService.getTodayStatus).toHaveBeenCalledWith('user-uuid-1');
    expect(result).toEqual(mockToday);
  });

  it('delegates startOrResumeSession to service with authenticated userId', async () => {
    const mockSession = {} as TutorSessionWithItemDataDto;
    tutorService.startOrResumeSession.mockResolvedValue(mockSession);
    const result = await controller.startOrResumeSession(mockUser);
    expect(tutorService.startOrResumeSession).toHaveBeenCalledWith(
      'user-uuid-1',
    );
    expect(result).toEqual(mockSession);
  });

  it('delegates getSession to service with userId and sessionId', async () => {
    const mockSession = {} as TutorSessionWithItemDataDto;
    tutorService.getSession.mockResolvedValue(mockSession);
    const result = await controller.getSession(mockUser, {
      sessionId: 'session-1',
    });
    expect(tutorService.getSession).toHaveBeenCalledWith(
      'user-uuid-1',
      'session-1',
    );
    expect(result).toEqual(mockSession);
  });

  it('delegates getSessionDetail to service with userId and sessionId', async () => {
    const mockDetail = {
      session: {},
      items: [],
    } as unknown as TutorSessionDetailDataDto;
    tutorService.getSessionDetail.mockResolvedValue(mockDetail);
    const result = await controller.getSessionDetail(mockUser, {
      sessionId: 'session-1',
    });
    expect(tutorService.getSessionDetail).toHaveBeenCalledWith(
      'user-uuid-1',
      'session-1',
    );
    expect(result).toEqual(mockDetail);
  });

  it('delegates submitAnswer to service with userId, sessionId, itemId, and DTO', async () => {
    const mockAnswer = {} as SubmitAnswerResponseDataDto;
    tutorService.submitAnswer.mockResolvedValue(mockAnswer);
    const dto = { answer: 'A', hintUsed: false };
    const result = await controller.submitAnswer(
      mockUser,
      { sessionId: 'session-1', itemId: 'item-1' },
      dto,
    );
    expect(tutorService.submitAnswer).toHaveBeenCalledWith(
      'user-uuid-1',
      'session-1',
      'item-1',
      dto,
    );
    expect(result).toEqual(mockAnswer);
  });

  it('delegates abandonSession to service with userId and sessionId', async () => {
    const mockSession = {} as TutorSessionWithItemDataDto;
    tutorService.abandonSession.mockResolvedValue(mockSession);
    const result = await controller.abandonSession(mockUser, {
      sessionId: 'session-1',
    });
    expect(tutorService.abandonSession).toHaveBeenCalledWith(
      'user-uuid-1',
      'session-1',
    );
    expect(result).toEqual(mockSession);
  });

  it('delegates getHistory to service with userId and query params', async () => {
    const mockHistory: TutorHistoryDataDto = {
      items: [],
      nextCursor: null,
      hasMore: false,
    };
    tutorService.getHistory.mockResolvedValue(mockHistory);
    const query = { limit: 10 };
    const result = await controller.getHistory(mockUser, query);
    expect(tutorService.getHistory).toHaveBeenCalledWith('user-uuid-1', query);
    expect(result).toEqual(mockHistory);
  });
});
