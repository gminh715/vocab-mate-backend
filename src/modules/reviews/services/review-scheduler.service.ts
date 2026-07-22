import { Injectable } from '@nestjs/common';
import { ReviewsRepository } from '../reviews.repository';

@Injectable()
export class ReviewSchedulerService {
  constructor(private readonly reviewsRepository: ReviewsRepository) {}
}
