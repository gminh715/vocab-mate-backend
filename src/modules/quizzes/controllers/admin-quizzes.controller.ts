import { Controller } from '@nestjs/common';
import { QuizzesService } from '../services/quizzes.service';

@Controller('admin/quizzes')
export class AdminQuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}
}
