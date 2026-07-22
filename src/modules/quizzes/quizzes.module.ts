import { Module } from '@nestjs/common';
import { AdminQuizzesController } from './controllers/admin-quizzes.controller';
import { QuizzesController } from './controllers/quizzes.controller';
import { QuizzesRepository } from './repositories/quizzes.repository';
import { QuizPublicationService } from './services/quiz-publication.service';
import { QuizQuestionsService } from './services/quiz-questions.service';
import { QuizzesService } from './services/quizzes.service';

@Module({
  controllers: [QuizzesController, AdminQuizzesController],
  providers: [
    QuizzesRepository,
    QuizzesService,
    QuizQuestionsService,
    QuizPublicationService,
  ],
})
export class QuizzesModule {}
