import { ConflictException, Injectable } from '@nestjs/common';
import {
  AuthUserRecord,
  CreateRegisteredUserInput,
  PublicUserRecord,
  UsersRepository,
} from './users.repository';

const isUniqueConstraintError = (error: unknown): error is { code: 'P2002' } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002';

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
