import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AiModule } from '../ai/ai.module';
import { TutorController } from './controllers/tutor.controller';
import { TutorCandidateService } from './services/tutor-candidate.service';
import { TutorFsrsService } from './services/tutor-fsrs.service';
import { TutorRatingService } from './services/tutor-rating.service';
import { TutorResponseMapper } from './services/tutor-response.mapper';
import { TutorService } from './services/tutor.service';

@Module({
  imports: [AiModule],
  controllers: [TutorController],
  providers: [
    TutorService,
    TutorFsrsService,
    TutorRatingService,
    TutorCandidateService,
    TutorResponseMapper,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    TutorService,
    TutorFsrsService,
    TutorRatingService,
    TutorCandidateService,
    TutorResponseMapper,
  ],
})
export class TutorModule {}
