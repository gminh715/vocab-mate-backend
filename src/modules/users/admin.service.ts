import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminUserListQueryDto } from './dto/admin-user-list-query.dto';
import type { UpdateUserRoleDto } from './dto/update-user-role.dto';
import type { UpdateUserStatusDto } from './dto/update-user-status.dto';
import type {
  AdminUserMutationResult,
  AdminUserDetailRecord,
  AdminUserListRecord,
  UpdatedAdminUserRoleRecord,
  UpdatedAdminUserStatusRecord,
} from './users.repository';
import {
  ConcurrentAdminMutationError,
  UsersRepository,
} from './users.repository';

export interface AdminUserListResponse {
  items: AdminUserListRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Coordinates administrative user use cases and maps repository outcomes to
 * documented HTTP exceptions without depending on request/response objects.
 */
@Injectable()
export class AdminService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findAll(query: AdminUserListQueryDto): Promise<AdminUserListResponse> {
    const result = await this.usersRepository.findAdminUsers(query);

    return {
      items: result.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOne(userId: string): Promise<AdminUserDetailRecord> {
    const detail = await this.usersRepository.findAdminUserDetail(userId);

    if (!detail) {
      throw new NotFoundException('User not found');
    }

    return detail;
  }

  async updateStatus(
    actingAdminId: string,
    userId: string,
    dto: UpdateUserStatusDto,
  ): Promise<UpdatedAdminUserStatusRecord> {
    // Reject self-locking before starting a database transaction so the
    // caller receives the documented deterministic conflict.
    if (actingAdminId === userId && dto.status !== 'ACTIVE') {
      throw new ConflictException(
        'Administrators cannot suspend or disable their own account',
      );
    }

    try {
      const result = await this.usersRepository.updateAdminUserStatus(
        userId,
        dto.status,
      );

      return this.unwrapMutationResult(result);
    } catch (error: unknown) {
      this.mapConcurrentMutationError(error);
    }
  }

  async updateRole(
    actingAdminId: string,
    userId: string,
    dto: UpdateUserRoleDto,
  ): Promise<UpdatedAdminUserRoleRecord> {
    // The acting identity comes from the verified JWT context, never input.
    if (actingAdminId === userId && dto.role !== 'ADMIN') {
      throw new ConflictException(
        'Administrators cannot demote their own account',
      );
    }

    try {
      const result = await this.usersRepository.updateAdminUserRole(
        userId,
        dto.role,
      );

      return this.unwrapMutationResult(result);
    } catch (error: unknown) {
      this.mapConcurrentMutationError(error);
    }
  }

  private unwrapMutationResult<T>(result: AdminUserMutationResult<T>): T {
    if (result.outcome === 'not_found') {
      throw new NotFoundException('User not found');
    }

    if (result.outcome === 'last_active_admin') {
      throw new ConflictException(
        'At least one active administrator must remain',
      );
    }

    return result.user;
  }

  private mapConcurrentMutationError(error: unknown): never {
    if (error instanceof ConcurrentAdminMutationError) {
      throw new ConflictException(
        'The administrator account changed concurrently; retry the request',
      );
    }

    throw error;
  }
}
