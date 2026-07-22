import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import { ApiExceptionFilter } from '../../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../../common/interceptors/success-response.interceptor';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminUsersService } from '../admin-users.service';
import { AdminUserListQueryDto } from '../dto/admin-user-list-query.dto';
import { AdminUserParamsDto } from '../dto/admin-user-params.dto';
import {
  AdminUserDetailSuccessResponseDto,
  AdminUserListSuccessResponseDto,
  UpdateUserRoleSuccessResponseDto,
  UpdateUserStatusSuccessResponseDto,
} from '../dto/admin-users-response.dto';
import { UpdateUserRoleDto } from '../dto/update-user-role.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';

/**
 * ADMIN-only HTTP boundary for user administration.
 * Guards enforce authentication and role authorization before delegation;
 * business invariants remain in AdminUsersService.
 */
@ApiTags('Admin Users')
@Controller('admin/users')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminUsers',
    summary: 'List users with pagination and filters',
    description:
      'ADMIN-only account listing with allowlisted filtering, search, and sorting.',
  })
  @ApiOkResponse({ type: AdminUserListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(@Query() query: AdminUserListQueryDto) {
    return this.adminUsersService.findAll(query);
  }

  @Get(':userId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminUsersByUserId',
    summary: 'Get a user account, profile, and learning summary',
    description:
      'ADMIN-only detail containing safe account fields and lightweight aggregate counts.',
  })
  @ApiOkResponse({ type: AdminUserDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: AdminUserParamsDto) {
    return this.adminUsersService.findOne(params.userId);
  }

  @Patch(':userId/status')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminUsersByUserIdStatus',
    summary: 'Change a user account status',
    description:
      'ADMIN-only status change. An administrator cannot suspend or disable themselves, and the system always preserves at least one active administrator.',
  })
  @ApiOkResponse({ type: UpdateUserStatusSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description:
      'The acting administrator attempted to lock themselves, or the change would remove the last active administrator.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  updateStatus(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminUserParamsDto,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminUsersService.updateStatus(
      actingAdmin.id,
      params.userId,
      dto,
    );
  }

  @Patch(':userId/role')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchAdminUsersByUserIdRole',
    summary: 'Change a user role',
    description:
      'ADMIN-only role change. An administrator cannot demote themselves, and the system always preserves at least one active administrator.',
  })
  @ApiOkResponse({ type: UpdateUserRoleSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description:
      'The acting administrator attempted to demote themselves, or the change would remove the last active administrator.',
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  updateRole(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Param() params: AdminUserParamsDto,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.adminUsersService.updateRole(
      actingAdmin.id,
      params.userId,
      dto,
    );
  }
}
