import { Module } from '@nestjs/common';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../common/interceptors/success-response.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { AdminController } from './controllers/admin.controller';
import { UsersController } from './controllers/users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * Owns self-service and administrative user-management use cases.
 * Authentication primitives are reused from AuthModule files; this module
 * only registers the guards needed by its controllers.
 */
@Module({
  controllers: [UsersController, AdminController],
  providers: [
    UsersRepository,
    UsersService,
    JwtAuthGuard,
    RolesGuard,
    AdminService,
    SuccessResponseInterceptor,
    ApiExceptionFilter,
  ],
  exports: [UsersService],
})
export class UsersModule {}
