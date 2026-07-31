import { Module } from '@nestjs/common';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../common/interceptors/success-response.interceptor';
import { ArticlesModule } from '../articles/articles.module';
import { AiModule } from '../ai/ai.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReadingController } from './controllers/reading.controller';
import { ReadingRepository } from './reading.repository';
import { ReadingService } from './reading.service';

@Module({
  imports: [AiModule, ArticlesModule],
  controllers: [ReadingController],
  providers: [
    ReadingRepository,
    ReadingService,
    JwtAuthGuard,
    SuccessResponseInterceptor,
    ApiExceptionFilter,
  ],
  exports: [ReadingService],
})
export class ReadingModule {}
