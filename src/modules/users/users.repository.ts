import { Injectable } from '@nestjs/common';
import type {
  CefrLevel,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';

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
  currentCefrLevel: CefrLevel;
  learningGoal?: string;
  preferredLanguage?: string;
}

const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
} as const;

const authUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
} as const;

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
            currentCefrLevel: input.currentCefrLevel,
            learningGoal: input.learningGoal,
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
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: publicUserSelect,
    });
  }
}
