import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { AiModule } from '../ai/ai.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReadingController } from './controllers/reading.controller';
import { ContextualTermsRepository } from './repositories/contextual-terms.repository';
import { ContextualTermsService } from './services/contextual-terms.service';
import { ReadingRepository } from './repositories/reading.repository';
import { ReadingService } from './services/reading.service';

@Module({
  imports: [AiModule, ArticlesModule],
  controllers: [ReadingController],
  providers: [
    ReadingRepository,
    ReadingService,
    ContextualTermsRepository,
    ContextualTermsService,
    JwtAuthGuard,
  ],
  exports: [ContextualTermsService],
})
export class ReadingModule {}
