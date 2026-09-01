import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './services/admin.service';
import { CloudinaryService } from './services/cloudinary.service';
import { AdminController } from './controllers/admin.controller';
import { UsersController } from './controllers/users.controller';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './services/users.service';

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
    CloudinaryService,
    JwtAuthGuard,
    RolesGuard,
    AdminService,
  ],
  exports: [UsersService, CloudinaryService],
})
export class UsersModule {}

