import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CollectionsController } from './controllers/collections.controller';
import { CollectionsRepository } from './repositories/collections.repository';
import { CollectionsService } from './services/collections.service';

@Module({
  controllers: [CollectionsController],
  providers: [
    CollectionsRepository,
    CollectionsService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class CollectionsModule {}
