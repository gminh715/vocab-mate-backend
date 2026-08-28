import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { AuthenticatedUserThrottlerGuard } from '../../../common/guards/authenticated-user-throttler.guard';
import type { AuthConfig } from '../../../config/auth.config';
import { AUTH_CONFIG } from '../../../config/config.module';
import { AuthService } from '../services/auth.service';
import type {
  AuthenticatedUser,
  RefreshAuthenticatedUser,
} from '../auth.types';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ChangePasswordDto } from '../dto/change-password.dto';
import {
  AccessTokenSuccessResponseDto,
  AuthSuccessResponseDto,
  MessageSuccessResponseDto,
} from '../dto/auth-response.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RefreshJwtGuard } from '../guards/refresh-jwt.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('register')
  @Version('1')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(AuthenticatedUserThrottlerGuard)
  @ApiOperation({
    operationId: 'postAuthRegister',
    summary: 'Register a USER account with initial learning settings',
  })
  @ApiCreatedResponse({ type: AuthSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUser; accessToken: string }> {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('login')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(AuthenticatedUserThrottlerGuard)
  @ApiOperation({
    operationId: 'postAuthLogin',
    summary: 'Log in with email and password',
  })
  @ApiOkResponse({ type: AuthSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUser; accessToken: string }> {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(response, result.refreshToken);

    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('refresh')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshJwtGuard, AuthenticatedUserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    operationId: 'postAuthRefresh',
    summary: 'Issue a new access token using a refresh token',
    description:
      'Reads the refreshToken HttpOnly cookie and rotates it. No request body is accepted.',
  })
  @ApiCookieAuth('CookieAuth')
  @ApiOkResponse({ type: AccessTokenSuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async refresh(
    @CurrentUser() user: RefreshAuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.authService.refresh(user);
    this.setRefreshCookie(response, tokens.refreshToken);

    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    operationId: 'postAuthLogout',
    summary: 'Log out and clear the refresh-token cookie',
  })
  @ApiBearerAuth('BearerAuth')
  @ApiOkResponse({ type: MessageSuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const cookies: unknown = request.cookies;
    const refreshToken =
      typeof cookies === 'object' &&
      cookies !== null &&
      'refreshToken' in cookies
        ? (cookies as { refreshToken?: unknown }).refreshToken
        : undefined;
    await this.authService.logout(
      user.id,
      typeof refreshToken === 'string' ? refreshToken : undefined,
    );
    response.clearCookie('refreshToken', this.refreshCookieOptions(false));
    return { message: 'Thao tác thành công.' };
  }

  @Patch('change-password')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    operationId: 'patchAuthChangePassword',
    summary: 'Change the authenticated account password',
  })
  @ApiBearerAuth('BearerAuth')
  @ApiOkResponse({ type: MessageSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(user.id, dto);
    response.clearCookie('refreshToken', this.refreshCookieOptions(false));

    return { message: 'Thao tác thành công.' };
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(
      'refreshToken',
      refreshToken,
      this.refreshCookieOptions(true),
    );
  }

  private refreshCookieOptions(includeMaxAge: boolean): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      path: '/api/v1/auth',
      ...(includeMaxAge
        ? { maxAge: this.config.refreshExpiresInSeconds * 1000 }
        : {}),
    };
  }
}
