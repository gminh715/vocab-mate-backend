import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminCategoriesController } from './controllers/admin-categories.controller';
import { CategoriesController } from './controllers/categories.controller';
import { CategoriesRepository } from './repositories/categories.repository';
import { CategoriesService } from './services/categories.service';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [
    CategoriesRepository,
    CategoriesService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [CategoriesService],
})
export class CategoriesModule {}
