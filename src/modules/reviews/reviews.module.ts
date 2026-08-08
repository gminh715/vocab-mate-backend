import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ReviewSessionsController } from './controllers/review-sessions.controller';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsRepository } from './reviews.repository';
import { AnswerGradingService } from './services/answer-grading.service';
import { AiAssistedQuestionGeneratorService } from './services/ai-assisted-question-generator.service';
import { InvisibleReviewScoringService } from './services/invisible-review-scoring.service';
import { QuestionSelectionService } from './services/question-selection.service';
import { ReviewsService } from './services/reviews.service';

@Module({
  imports: [AiModule],
  controllers: [ReviewsController, ReviewSessionsController],
  providers: [
    ReviewsRepository,
    ReviewsService,
    AiAssistedQuestionGeneratorService,
    AnswerGradingService,
    InvisibleReviewScoringService,
    QuestionSelectionService,
  ],
})
export class ReviewsModule {}
