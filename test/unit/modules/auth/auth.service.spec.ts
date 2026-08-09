import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import type { AuthConfig } from '../../../../src/config/auth.config';
import { AUTH_CONFIG } from '../../../../src/config/config.module';
import type {
  AuthUserRecord,
  CreateRegisteredUserInput,
  PublicUserRecord,
} from '../../../../src/modules/users/users.repository';
import { UsersService } from '../../../../src/modules/users/users.service';
import { AuthService } from '../../../../src/modules/auth/auth.service';
import type { JwtPayload } from '../../../../src/modules/auth/auth.types';
import type { RegisterDto } from '../../../../src/modules/auth/dto/register.dto';

const config: AuthConfig = {
  accessSecret: 'test-access-secret-at-least-32-characters',
  accessExpiresInSeconds: 900,
  refreshSecret: 'test-refresh-secret-at-least-32-characters',
  refreshExpiresInSeconds: 604800,
  bcryptRounds: 4,
  cookieSecure: false,
  cookieSameSite: 'lax',
};

const safeUser: PublicUserRecord = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'user@example.com',
  role: 'USER',
  status: 'ACTIVE',
};

interface UsersServiceMock {
  createRegisteredUser: jest.MockedFunction<
    (input: CreateRegisteredUserInput) => Promise<PublicUserRecord>
  >;
  findByEmailWithPassword: jest.MockedFunction<
    (email: string) => Promise<AuthUserRecord | null>
  >;
  findByIdWithPassword: jest.MockedFunction<
    (id: string) => Promise<AuthUserRecord | null>
  >;
  findSafeById: jest.MockedFunction<
    (id: string) => Promise<PublicUserRecord | null>
  >;
  updateLastLogin: jest.MockedFunction<
    (id: string) => Promise<PublicUserRecord>
  >;
  updatePassword: jest.MockedFunction<
    (id: string, passwordHash: string) => Promise<PublicUserRecord>
  >;
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let usersService: UsersServiceMock;

  beforeEach(async () => {
    usersService = {
      createRegisteredUser: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findByIdWithPassword: jest.fn(),
      findSafeById: jest.fn(),
      updateLastLogin: jest.fn(),
      updatePassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
  });

  describe('register', () => {
    const dto: RegisterDto = {
      email: '  User@Example.COM ',
      password: 'StrongPass@123',
      displayName: 'Nguyen Van A',
      currentCefrLevel: 'B1',
    };

    it('normalizes email, hashes the password, and returns only a safe user', async () => {
      usersService.createRegisteredUser.mockResolvedValue(safeUser);

      const result = await service.register(dto);
      const createInput = usersService.createRegisteredUser.mock
        .calls[0][0] as {
        email: string;
        passwordHash: string;
      };

      expect(createInput.email).toBe('user@example.com');
      expect(createInput.passwordHash).not.toBe(dto.password);
      await expect(
        bcrypt.compare(dto.password, createInput.passwordHash),
      ).resolves.toBe(true);
      expect(result.user).toEqual(safeUser);
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('preserves duplicate-email conflict errors', async () => {
      usersService.createRegisteredUser.mockRejectedValue(
        new ConflictException('Email is already registered'),
      );

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    let authUser: AuthUserRecord;

    beforeEach(async () => {
      authUser = {
        ...safeUser,
        passwordHash: await bcrypt.hash('StrongPass@123', 4),
      };
      usersService.updateLastLogin.mockResolvedValue(safeUser);
    });

    it('logs in with normalized email and excludes sensitive fields', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(authUser);

      const result = await service.login({
        email: ' User@Example.COM ',
        password: 'StrongPass@123',
      });

      expect(usersService.findByEmailWithPassword).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(usersService.updateLastLogin).toHaveBeenCalledWith(safeUser.id);
      expect(result.user).toEqual(safeUser);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it.each([
      ['unknown email', null],
      ['wrong password', authUser],
    ])('returns the same generic error for %s', async (_case, user) => {
      usersService.findByEmailWithPassword.mockResolvedValue(user);

      await expect(
        service.login({
          email: 'user@example.com',
          password: 'WrongPass@123',
        }),
      ).rejects.toMatchObject({
        constructor: UnauthorizedException,
        message: 'Invalid email or password',
      });
    });

    it.each(['SUSPENDED', 'DISABLED'] as const)(
      'rejects a %s account',
      async (status) => {
        usersService.findByEmailWithPassword.mockResolvedValue({
          ...authUser,
          status,
        });

        await expect(
          service.login({
            email: 'user@example.com',
            password: 'StrongPass@123',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });

  it('rotates refresh tokens and issues verifiable token types', async () => {
    const first = await service.refresh(safeUser);
    const second = await service.refresh(safeUser);
    const accessPayload = await jwtService.verifyAsync<JwtPayload>(
      first.accessToken,
      { secret: config.accessSecret },
    );
    const refreshPayload = await jwtService.verifyAsync<JwtPayload>(
      first.refreshToken,
      { secret: config.refreshSecret },
    );

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(accessPayload).toMatchObject({ sub: safeUser.id, type: 'access' });
    expect(refreshPayload).toMatchObject({ sub: safeUser.id, type: 'refresh' });
  });

  it('rejects missing or inactive users during refresh validation', async () => {
    usersService.findSafeById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...safeUser,
        status: 'DISABLED',
      });

    await expect(
      service.validateRefreshUser(safeUser.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.validateRefreshUser(safeUser.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('changePassword', () => {
    it('verifies and hashes the new password', async () => {
      const currentHash = await bcrypt.hash('OldPass@123', 4);
      usersService.findByIdWithPassword.mockResolvedValue({
        ...safeUser,
        passwordHash: currentHash,
      });

      await service.changePassword(safeUser.id, {
        currentPassword: 'OldPass@123',
        newPassword: 'NewPass@123',
      });

      const newHash = usersService.updatePassword.mock.calls[0][1];
      expect(newHash).not.toBe('NewPass@123');
      await expect(bcrypt.compare('NewPass@123', newHash)).resolves.toBe(true);
    });

    it('rejects an incorrect current password', async () => {
      usersService.findByIdWithPassword.mockResolvedValue({
        ...safeUser,
        passwordHash: await bcrypt.hash('OldPass@123', 4),
      });

      await expect(
        service.changePassword(safeUser.id, {
          currentPassword: 'WrongPass@123',
          newPassword: 'NewPass@123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects reuse of the current password', async () => {
      usersService.findByIdWithPassword.mockResolvedValue({
        ...safeUser,
        passwordHash: await bcrypt.hash('OldPass@123', 4),
      });

      await expect(
        service.changePassword(safeUser.id, {
          currentPassword: 'OldPass@123',
          newPassword: 'OldPass@123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
