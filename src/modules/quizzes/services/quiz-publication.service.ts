import { Injectable } from '@nestjs/common';
import { QuizzesRepository } from '../repositories/quizzes.repository';

@Injectable()
export class QuizPublicationService {
  constructor(private readonly quizzesRepository: QuizzesRepository) {}
}
