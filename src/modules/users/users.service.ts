import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import {
  AuthUserRecord,
  CreateRegisteredUserInput,
  MyAccountRecord,
  PublicUserRecord,
  UpdatedMyProfileRecord,
  UpdateMyProfileInput,
  UsersRepository,
} from './users.repository';

const isUniqueConstraintError = (error: unknown): error is { code: 'P2002' } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002';

const isRecordNotFoundError = (error: unknown): error is { code: 'P2025' } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2025';

/**
 * Owns self-service user rules and the user operations required by AuthModule.
 * HTTP objects and Prisma queries deliberately stay outside this service.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByEmailWithPassword(email: string): Promise<AuthUserRecord | null> {
    return this.usersRepository.findByEmailWithPassword(email);
  }

  findByIdWithPassword(id: string): Promise<AuthUserRecord | null> {
    return this.usersRepository.findByIdWithPassword(id);
  }

  findSafeById(id: string): Promise<PublicUserRecord | null> {
    return this.usersRepository.findSafeById(id);
  }

  async getMe(
    userId: string,
  ): Promise<
    MyAccountRecord & { profile: NonNullable<MyAccountRecord['profile']> }
  > {
    const account = await this.usersRepository.findMyAccount(userId);

    if (!account) {
      throw new NotFoundException('User not found');
    }

    if (!account.profile) {
      throw new NotFoundException('User profile not found');
    }

    return account as MyAccountRecord & {
      profile: NonNullable<MyAccountRecord['profile']>;
    };
  }

  async updateMe(
    userId: string,
    dto: UpdateMyProfileDto,
  ): Promise<UpdatedMyProfileRecord> {
    const input: UpdateMyProfileInput = {};

    if (dto.displayName !== undefined) input.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) input.avatarUrl = dto.avatarUrl;
    if (dto.currentCefrLevel !== undefined) {
      input.currentCefrLevel = dto.currentCefrLevel;
    }
    if (dto.learningGoal !== undefined) input.learningGoal = dto.learningGoal;
    if (dto.preferredLanguage !== undefined) {
      input.preferredLanguage = dto.preferredLanguage;
    }

    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one profile field is required');
    }

    try {
      return await this.usersRepository.updateMyProfile(userId, input);
    } catch (error: unknown) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('User profile not found');
      }

      throw error;
    }
  }

  async createRegisteredUser(
    input: CreateRegisteredUserInput,
  ): Promise<PublicUserRecord> {
    try {
      return await this.usersRepository.createWithProfile(input);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }
  }

  updateLastLogin(id: string): Promise<PublicUserRecord> {
    return this.usersRepository.updateLastLogin(id);
  }

  updatePassword(id: string, passwordHash: string): Promise<PublicUserRecord> {
    return this.usersRepository.updatePassword(id, passwordHash);
  }
}
