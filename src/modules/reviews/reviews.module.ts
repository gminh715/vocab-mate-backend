import { Module } from '@nestjs/common';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsRepository } from './reviews.repository';
import { AnswerGradingService } from './services/answer-grading.service';
import { ReviewSchedulerService } from './services/review-scheduler.service';
import { ReviewsService } from './services/reviews.service';

@Module({
  controllers: [ReviewsController],
  providers: [
    ReviewsRepository,
    ReviewsService,
    AnswerGradingService,
    ReviewSchedulerService,
  ],
})
export class ReviewsModule {}
