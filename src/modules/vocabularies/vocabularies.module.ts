import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReadingModule } from '../reading/reading.module';
import { VocabulariesController } from './vocabularies.controller';
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
  ],
})
export class VocabulariesModule {}
