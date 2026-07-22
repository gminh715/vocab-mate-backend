import { Injectable } from '@nestjs/common';
import { QuizzesRepository } from '../repositories/quizzes.repository';

@Injectable()
export class QuizzesService {
  constructor(private readonly quizzesRepository: QuizzesRepository) {}
}
