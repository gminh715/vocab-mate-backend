import { Module } from '@nestjs/common';
import { CollectionsController } from './controllers/collections.controller';
import { CollectionsRepository } from './collections.repository';
import { CollectionsService } from './collections.service';

@Module({
  controllers: [CollectionsController],
  providers: [CollectionsRepository, CollectionsService],
})
export class CollectionsModule {}
