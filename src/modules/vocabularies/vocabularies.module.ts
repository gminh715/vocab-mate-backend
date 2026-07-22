import { Module } from '@nestjs/common';
import { VocabulariesController } from './controllers/vocabularies.controller';
import { VocabulariesRepository } from './vocabularies.repository';
import { VocabulariesService } from './vocabularies.service';

@Module({
  controllers: [VocabulariesController],
  providers: [VocabulariesRepository, VocabulariesService],
})
export class VocabulariesModule {}
