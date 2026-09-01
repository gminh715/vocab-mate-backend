import type { Request } from 'express';
import type { PublicUserRecord } from '../users/repositories/users.repository';

export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  type: TokenType;
  jti: string;
  iat?: number;
  exp?: number;
}

export type AuthenticatedUser = PublicUserRecord;

export interface RefreshAuthenticatedUser extends AuthenticatedUser {
  refreshTokenId: string;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends IssuedTokens {
  user: PublicUserRecord;
}
