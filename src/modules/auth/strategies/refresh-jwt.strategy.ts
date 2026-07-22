import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { AuthConfig } from '../../../config/auth.config';
import { AUTH_CONFIG } from '../../../config/config.module';
import { AuthService } from '../auth.service';
import type { AuthenticatedUser, JwtPayload } from '../auth.types';

const refreshTokenFromCookie = (request: Request): string | null => {
  const token: unknown = request.cookies?.refreshToken;
  return typeof token === 'string' ? token : null;
};

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: refreshTokenFromCookie,
      ignoreExpiration: false,
      secretOrKey: config.refreshSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'refresh') {
      throw new ForbiddenException('Refresh token is invalid or expired');
    }

    return this.authService.validateRefreshUser(payload.sub);
  }
}
