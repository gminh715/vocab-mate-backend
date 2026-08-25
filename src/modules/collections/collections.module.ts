import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CollectionsController } from './collections.controller';
import { CollectionsRepository } from './collections.repository';
import { CollectionsService } from './collections.service';

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
