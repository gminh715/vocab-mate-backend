import { Injectable } from '@nestjs/common';
import { CollectionsRepository } from './collections.repository';

@Injectable()
export class CollectionsService {
  constructor(private readonly collectionsRepository: CollectionsRepository) {}
}
