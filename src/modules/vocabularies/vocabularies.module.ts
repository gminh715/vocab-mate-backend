import { Module } from '@nestjs/common';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../common/interceptors/success-response.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReadingModule } from '../reading/reading.module';
import { VocabulariesController } from './controllers/vocabularies.controller';
import { VocabulariesRepository } from './vocabularies.repository';
import { VocabulariesService } from './vocabularies.service';

@Module({
  imports: [ReadingModule],
  controllers: [VocabulariesController],
  providers: [
    VocabulariesRepository,
    VocabulariesService,
    JwtAuthGuard,
    RolesGuard,
    SuccessResponseInterceptor,
    ApiExceptionFilter,
  ],
})
export class VocabulariesModule {}
