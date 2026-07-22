import { Controller } from '@nestjs/common';
import { VocabulariesService } from '../vocabularies.service';

@Controller('vocabularies')
export class VocabulariesController {
  constructor(private readonly vocabulariesService: VocabulariesService) {}
}
