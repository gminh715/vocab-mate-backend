import { Injectable } from '@nestjs/common';
import type {
  CefrLevel,
  UserRole,
  UserStatus,
} from '../../../../generated/prisma/enums';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface PublicUserRecord {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthUserRecord extends PublicUserRecord {
  passwordHash: string;
}

export interface CreateRegisteredUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  preferredLanguage?: string;
}

export interface UserProfileRecord {
  displayName: string;
  avatarUrl: string | null;
  currentCefrLevel: CefrLevel;
  learningGoal: string | null;
  dailyStudyMinutes: number | null;
  preferredLanguage: string;
}

export interface MyAccountRecord extends PublicUserRecord {
  profile: UserProfileRecord | null;
}

export interface UpdateMyProfileInput {
  displayName?: string;
  avatarUrl?: string;
  currentCefrLevel?: CefrLevel;
  learningGoal?: CefrLevel;
  dailyStudyMinutes?: number;
  preferredLanguage?: string;
}

export interface UpdatedMyProfileRecord {
  user: PublicUserRecord;
  profile: UserProfileRecord;
}

export interface AdminUserListQuery {
  page: number;
  limit: number;
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  sort: 'newest' | 'oldest';
}

export interface AdminUserListRecord extends PublicUserRecord {
  lastLoginAt: Date | null;
  createdAt: Date;
  profile: { displayName: string } | null;
}

export interface AdminUserListResult {
  items: AdminUserListRecord[];
  total: number;
}

export interface AdminUserDetailRecord {
  user: PublicUserRecord & {
    lastLoginAt: Date | null;
    createdAt: Date;
  };
  profile: UserProfileRecord | null;
  learningSummary: {
    savedVocabularyCount: number;
    masteredVocabularyCount: number;
    completedArticleCount: number;
  };
}

export interface UpdatedAdminUserStatusRecord {
  id: string;
  status: UserStatus;
  updatedAt: Date;
}

export interface UpdatedAdminUserRoleRecord {
  id: string;
  role: UserRole;
  updatedAt: Date;
}

export interface CreateRefreshSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export type AdminUserMutationResult<T> =
  | { outcome: 'success'; user: T }
  | { outcome: 'not_found' }
  | { outcome: 'last_active_admin' };

export class ConcurrentAdminMutationError extends Error {
  constructor() {
    super('Concurrent administrator account update');
    this.name = ConcurrentAdminMutationError.name;
  }
}

/** Public projection shared by API responses and authenticated identities. */
const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
} as const;

/** Authentication-only projection; never use it for public/admin responses. */
const authUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
} as const;

const userProfileSelect = {
  displayName: true,
  avatarUrl: true,
  currentCefrLevel: true,
  learningGoal: true,
  dailyStudyMinutes: true,
  preferredLanguage: true,
} as const;

const adminUserAccountSelect = {
  ...publicUserSelect,
  lastLoginAt: true,
  createdAt: true,
} as const;

const adminUserMutationLookupSelect = {
  id: true,
  role: true,
  status: true,
  updatedAt: true,
} as const;

const SERIALIZABLE_RETRY_LIMIT = 3;

const isTransactionConflictError = (
  error: unknown,
): error is { code: 'P2034' } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2034';

/**
 * Contains all UsersModule Prisma access. Each method uses a use-case-specific
 * projection so sensitive authentication fields cannot leak accidentally.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmailWithPassword(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: authUserSelect,
    });
  }

  findByIdWithPassword(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: authUserSelect,
    });
  }

  findSafeById(id: string): Promise<PublicUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  findMyAccount(id: string): Promise<MyAccountRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        profile: { select: userProfileSelect },
      },
    });
  }

  async updateMyProfile(
    userId: string,
    input: UpdateMyProfileInput,
  ): Promise<UpdatedMyProfileRecord> {
    const { user, ...profile } = await this.prisma.userProfile.update({
      where: { userId },
      data: input,
      select: {
        ...userProfileSelect,
        user: { select: publicUserSelect },
      },
    });

    return { user, profile };
  }

  async findAdminUsers(
    query: AdminUserListQuery,
  ): Promise<AdminUserListResult> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              {
                profile: {
                  is: {
                    displayName: {
                      contains: query.q,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const direction = query.sort === 'oldest' ? 'asc' : 'desc';

    // Fetch the bounded page and its matching total without loading relations
    // per row, avoiding both in-memory pagination and N+1 queries.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: direction }, { id: 'asc' }],
        select: {
          ...adminUserAccountSelect,
          profile: { select: { displayName: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async findAdminUserDetail(
    userId: string,
  ): Promise<AdminUserDetailRecord | null> {
    // Counts are computed in the database; learning histories are never loaded.
    const [
      account,
      savedVocabularyCount,
      masteredVocabularyCount,
      completedArticleCount,
    ] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          ...adminUserAccountSelect,
          profile: { select: userProfileSelect },
        },
      }),
      this.prisma.userVocabulary.count({ where: { userId } }),
      this.prisma.userVocabulary.count({
        where: { userId, learningStatus: 'MASTERED' },
      }),
      this.prisma.userArticleProgress.count({
        where: { userId, status: 'COMPLETED' },
      }),
    ]);

    if (!account) {
      return null;
    }

    const { profile, ...user } = account;

    return {
      user,
      profile,
      learningSummary: {
        savedVocabularyCount,
        masteredVocabularyCount,
        completedArticleCount,
      },
    };
  }

  updateAdminUserStatus(
    userId: string,
    status: UserStatus,
  ): Promise<AdminUserMutationResult<UpdatedAdminUserStatusRecord>> {
    return this.runSerializableMutation<
      AdminUserMutationResult<UpdatedAdminUserStatusRecord>
    >(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id: userId },
        select: adminUserMutationLookupSelect,
      });

      if (!target) {
        return { outcome: 'not_found' };
      }

      if (target.status === status) {
        return {
          outcome: 'success',
          user: {
            id: target.id,
            status: target.status,
            updatedAt: target.updatedAt,
          },
        };
      }

      if (
        target.role === 'ADMIN' &&
        target.status === 'ACTIVE' &&
        status !== 'ACTIVE' &&
        (await this.countActiveAdmins(transaction)) <= 1
      ) {
        // Status changes participate in the same invariant as role changes:
        // the system must always retain one ACTIVE ADMIN.
        return { outcome: 'last_active_admin' };
      }

      const user = await transaction.user.update({
        where: { id: userId },
        data: { status },
        select: { id: true, status: true, updatedAt: true },
      });

      if (status !== 'ACTIVE') {
        await transaction.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return { outcome: 'success', user };
    });
  }

  updateAdminUserRole(
    userId: string,
    role: UserRole,
  ): Promise<AdminUserMutationResult<UpdatedAdminUserRoleRecord>> {
    return this.runSerializableMutation<
      AdminUserMutationResult<UpdatedAdminUserRoleRecord>
    >(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id: userId },
        select: adminUserMutationLookupSelect,
      });

      if (!target) {
        return { outcome: 'not_found' };
      }

      if (target.role === role) {
        return {
          outcome: 'success',
          user: {
            id: target.id,
            role: target.role,
            updatedAt: target.updatedAt,
          },
        };
      }

      if (
        target.role === 'ADMIN' &&
        target.status === 'ACTIVE' &&
        role !== 'ADMIN' &&
        (await this.countActiveAdmins(transaction)) <= 1
      ) {
        return { outcome: 'last_active_admin' };
      }

      const user = await transaction.user.update({
        where: { id: userId },
        data: { role },
        select: { id: true, role: true, updatedAt: true },
      });

      return { outcome: 'success', user };
    });
  }

  createWithProfile(
    input: CreateRegisteredUserInput,
  ): Promise<PublicUserRecord> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        profile: {
          create: {
            displayName: input.displayName,
            currentCefrLevel: 'A1',
            preferredLanguage: input.preferredLanguage,
          },
        },
      },
      select: publicUserSelect,
    });
  }

  updateLastLogin(id: string): Promise<PublicUserRecord> {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
      select: publicUserSelect,
    });
  }

  updatePassword(id: string, passwordHash: string): Promise<PublicUserRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: { passwordHash },
        select: publicUserSelect,
      });
      await transaction.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return user;
    });
  }

  createRefreshSession(input: CreateRefreshSessionInput): Promise<void> {
    return this.prisma.refreshSession
      .create({ data: input, select: { id: true } })
      .then(() => undefined);
  }

  async isRefreshSessionActive(
    userId: string,
    tokenHash: string,
  ): Promise<boolean> {
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        userId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return session !== null;
  }

  async rotateRefreshSession(
    userId: string,
    previousTokenHash: string,
    nextSession: CreateRefreshSessionInput,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const revokedAt = new Date();
      const revoked = await transaction.refreshSession.updateMany({
        where: {
          userId,
          tokenHash: previousTokenHash,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: { revokedAt },
      });

      if (revoked.count !== 1) {
        return false;
      }

      const previous = await transaction.refreshSession.findUniqueOrThrow({
        where: { tokenHash: previousTokenHash },
        select: { id: true },
      });
      const replacement = await transaction.refreshSession.create({
        data: nextSession,
        select: { id: true },
      });
      await transaction.refreshSession.update({
        where: { id: previous.id },
        data: { replacedBySessionId: replacement.id },
      });
      return true;
    });
  }

  revokeRefreshSession(userId: string, tokenHash: string): Promise<void> {
    return this.prisma.refreshSession
      .updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .then(() => undefined);
  }

  private countActiveAdmins(transaction: Prisma.TransactionClient) {
    return transaction.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
  }

  private async runSerializableMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // PostgreSQL SERIALIZABLE prevents concurrent status/role requests from
    // both observing multiple admins and committing a zero-admin outcome.
    // Prisma reports serialization/write conflicts as P2034, so every retry
    // reruns the complete lookup, invariant check, and mutation.
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!isTransactionConflictError(error)) {
          throw error;
        }

        if (attempt === SERIALIZABLE_RETRY_LIMIT) {
          throw new ConcurrentAdminMutationError();
        }
      }
    }

    throw new ConcurrentAdminMutationError();
  }
}
