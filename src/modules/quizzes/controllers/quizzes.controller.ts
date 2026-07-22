import { Controller } from '@nestjs/common';
import { QuizzesService } from '../services/quizzes.service';

@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}
}
