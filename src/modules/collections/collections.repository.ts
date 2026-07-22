import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaService) {}
}
