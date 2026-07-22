import { Module } from '@nestjs/common';
import { ReadingController } from './controllers/reading.controller';
import { ReadingRepository } from './reading.repository';
import { ReadingService } from './reading.service';

@Module({
  controllers: [ReadingController],
  providers: [ReadingRepository, ReadingService],
})
export class ReadingModule {}
