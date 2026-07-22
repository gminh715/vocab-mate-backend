import { Injectable } from '@nestjs/common';
import { ReviewsRepository } from '../reviews.repository';

@Injectable()
export class ReviewsService {
  constructor(private readonly reviewsRepository: ReviewsRepository) {}
}
