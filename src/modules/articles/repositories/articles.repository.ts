import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ArticlesRepository {
  constructor(private readonly prisma: PrismaService) {}
}
