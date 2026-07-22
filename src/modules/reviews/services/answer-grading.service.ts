import { Injectable } from '@nestjs/common';
import { ReviewsRepository } from '../reviews.repository';

@Injectable()
export class AnswerGradingService {
  constructor(private readonly reviewsRepository: ReviewsRepository) {}
}
