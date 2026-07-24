import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { QuizPublicationService } from '../services/quiz-publication.service';
import { QuizQuestionsService } from '../services/quiz-questions.service';
import { QuizzesService } from '../services/quizzes.service';
import { AdminQuizzesController } from './admin-quizzes.controller';

describe('AdminQuizzesController', () => {
  it('derives mutation audit identity only from the authenticated admin', async () => {
    const service = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const quizQuestionsService = {
      createQuestion: jest.fn(),
      updateQuestion: jest.fn(),
      deleteQuestion: jest.fn(),
      createOption: jest.fn(),
      updateOption: jest.fn(),
      deleteOption: jest.fn(),
    };
    const quizPublicationService = {
      publish: jest.fn(),
      archive: jest.fn(),
      restoreDraft: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminQuizzesController],
      providers: [
        { provide: QuizzesService, useValue: service },
        { provide: QuizQuestionsService, useValue: quizQuestionsService },
        {
          provide: QuizPublicationService,
          useValue: quizPublicationService,
        },
      ],
    }).compile();
    const controller = module.get(AdminQuizzesController);
    const admin: AuthenticatedUser = {
      id: 'jwt-admin-id',
      email: 'admin@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
    };

    await controller.create(admin, {
      articleId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Quiz',
    });
    await controller.update(
      admin,
      { quizId: '550e8400-e29b-41d4-a716-446655440001' },
      { title: 'Updated' },
    );
    await controller.delete(admin, {
      quizId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(service.create).toHaveBeenCalledWith('jwt-admin-id', {
      articleId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Quiz',
    });
    expect(service.update).toHaveBeenCalledWith(
      'jwt-admin-id',
      '550e8400-e29b-41d4-a716-446655440001',
      { title: 'Updated' },
    );
    expect(service.delete).toHaveBeenCalledWith(
      'jwt-admin-id',
      '550e8400-e29b-41d4-a716-446655440001',
    );

    await controller.createQuestion(
      admin,
      { quizId: '550e8400-e29b-41d4-a716-446655440001' },
      {
        articleVocabularyId: '550e8400-e29b-41d4-a716-446655440002',
        questionType: 'SELECT_WORD',
        prompt: 'Prompt',
      },
    );
    expect(quizQuestionsService.createQuestion).toHaveBeenCalledWith(
      'jwt-admin-id',
      '550e8400-e29b-41d4-a716-446655440001',
      expect.objectContaining({
        articleVocabularyId: '550e8400-e29b-41d4-a716-446655440002',
      }),
    );

    await controller.publish(admin, {
      quizId: '550e8400-e29b-41d4-a716-446655440001',
    });
    await controller.archive(admin, {
      quizId: '550e8400-e29b-41d4-a716-446655440001',
    });
    await controller.restoreDraft(admin, {
      quizId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(quizPublicationService.publish).toHaveBeenCalledWith(
      'jwt-admin-id',
      '550e8400-e29b-41d4-a716-446655440001',
    );
    expect(quizPublicationService.archive).toHaveBeenCalledWith(
      'jwt-admin-id',
      '550e8400-e29b-41d4-a716-446655440001',
    );
    expect(quizPublicationService.restoreDraft).toHaveBeenCalledWith(
      'jwt-admin-id',
      '550e8400-e29b-41d4-a716-446655440001',
    );
  });
});
