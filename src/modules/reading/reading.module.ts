import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { AiModule } from '../ai/ai.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReadingController } from './reading.controller';
import { ContextualTermsRepository } from './contextual-terms.repository';
import { ContextualTermsService } from './contextual-terms.service';
import { ReadingRepository } from './reading.repository';
import { ReadingService } from './reading.service';

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
