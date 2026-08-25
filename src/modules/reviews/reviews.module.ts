import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ReviewSessionsController } from './controllers/review-sessions.controller';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewSessionsRepository } from './repositories/review-sessions.repository';
import { ReviewQuestionsRepository } from './repositories/review-questions.repository';
import { ReviewAgentRepository } from './repositories/review-agent.repository';
import { AnswerGradingService } from './services/answer-grading.service';
import { AiAssistedQuestionGeneratorService } from './services/ai-assisted-question-generator.service';
import { InvisibleReviewScoringService } from './services/invisible-review-scoring.service';
import { QuestionSelectionService } from './services/question-selection.service';
import { ReviewAgentService } from './services/review-agent.service';
import { ReviewPreparationProgressService } from './services/review-preparation-progress.service';
import { ReviewsService } from './services/reviews.service';
import { ReviewAnswerTransactionService } from './services/review-answer-transaction.service';

@Module({
  imports: [AiModule],
  controllers: [ReviewsController, ReviewSessionsController],
  providers: [
    ReviewSessionsRepository,
    ReviewQuestionsRepository,
    ReviewAgentRepository,
    ReviewsService,
    ReviewAnswerTransactionService,
    AiAssistedQuestionGeneratorService,
    AnswerGradingService,
    InvisibleReviewScoringService,
    QuestionSelectionService,
    ReviewAgentService,
    ReviewPreparationProgressService,
  ],
})
export class ReviewsModule {}
