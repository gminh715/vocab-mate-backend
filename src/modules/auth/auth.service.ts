import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { AuthConfig } from '../../config/auth.config';
import { AUTH_CONFIG } from '../../config/config.module';
import { UsersService } from '../users/users.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type {
  AuthResult,
  AuthenticatedUser,
  IssuedTokens,
  JwtPayload,
} from './auth.types';
import type { PublicUserRecord } from '../users/users.repository';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const DUMMY_PASSWORD_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.3pKBm5M7zKYYCq6VqvJ7uY2wK7jI0wS';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUserRecord> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(
      dto.password,
      this.config.bcryptRounds,
    );
    return this.usersService.createRegisteredUser({
      email,
      passwordHash,
      displayName: dto.displayName,
      preferredLanguage: dto.preferredLanguage,
    });
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmailWithPassword(email);

    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is suspended or disabled');
    }

    const safeUser = await this.usersService.updateLastLogin(user.id);
    const tokens = await this.issueTokens(user.id);

    return { user: safeUser, ...tokens };
  }

  async refresh(user: AuthenticatedUser): Promise<IssuedTokens> {
    return this.issueTokens(user.id);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);

    if (!user) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      this.config.bcryptRounds,
    );
    await this.usersService.updatePassword(userId, passwordHash);
  }

  async validateAccessUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.usersService.findSafeById(userId);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Access token is invalid');
    }

    return user;
  }

  async validateRefreshUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.usersService.findSafeById(userId);

    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Refresh token is invalid or expired');
    }

    return user;
  }

  private async issueTokens(userId: string): Promise<IssuedTokens> {
    const accessPayload: JwtPayload = {
      sub: userId,
      type: 'access',
      jti: randomUUID(),
    };
    const refreshPayload: JwtPayload = {
      sub: userId,
      type: 'refresh',
      jti: randomUUID(),
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.accessSecret,
        expiresIn: this.config.accessExpiresInSeconds,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.refreshSecret,
        expiresIn: this.config.refreshExpiresInSeconds,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
