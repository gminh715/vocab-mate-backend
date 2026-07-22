import { Injectable } from '@nestjs/common';
import { VocabulariesRepository } from './vocabularies.repository';

@Injectable()
export class VocabulariesService {
  constructor(
    private readonly vocabulariesRepository: VocabulariesRepository,
  ) {}
}
