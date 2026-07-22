import { Injectable } from '@nestjs/common';
import { ReadingRepository } from './reading.repository';

@Injectable()
export class ReadingService {
  constructor(private readonly readingRepository: ReadingRepository) {}
}
