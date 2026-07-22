import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth.types';

@Injectable()
export class RefreshJwtGuard extends AuthGuard('jwt-refresh') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (typeof request.cookies?.refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token is required');
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest<TUser = AuthenticatedUser>(
    error: Error | null,
    user: TUser | false,
  ): TUser {
    if (error) {
      throw error;
    }

    if (!user) {
      throw new ForbiddenException('Refresh token is invalid or expired');
    }

    return user;
  }
}
