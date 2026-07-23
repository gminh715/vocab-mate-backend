import { Module } from '@nestjs/common';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../common/interceptors/success-response.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CollectionsController } from './controllers/collections.controller';
import { CollectionsRepository } from './collections.repository';
import { CollectionsService } from './collections.service';

@Module({
  controllers: [CollectionsController],
  providers: [
    CollectionsRepository,
    CollectionsService,
    JwtAuthGuard,
    RolesGuard,
    SuccessResponseInterceptor,
    ApiExceptionFilter,
  ],
})
export class CollectionsModule {}
