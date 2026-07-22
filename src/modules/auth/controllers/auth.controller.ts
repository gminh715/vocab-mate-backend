import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { ApiExceptionFilter } from '../../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../../common/interceptors/success-response.interceptor';
import type { AuthConfig } from '../../../config/auth.config';
import { AUTH_CONFIG } from '../../../config/config.module';
import { AuthService } from '../auth.service';
import type { AuthenticatedUser } from '../auth.types';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ChangePasswordDto } from '../dto/change-password.dto';
import {
  AccessTokenSuccessResponseDto,
  ApiErrorResponseDto,
  AuthSuccessResponseDto,
  MessageSuccessResponseDto,
} from '../dto/auth-response.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RefreshJwtGuard } from '../guards/refresh-jwt.guard';

@ApiTags('Auth')
@Controller('auth')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('register')
  @Version('1')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    operationId: 'postAuthRegister',
    summary: 'Đăng ký tài khoản USER và tạo hồ sơ học tập',
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
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    operationId: 'postAuthLogin',
    summary: 'Đăng nhập bằng email và mật khẩu',
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
  @UseGuards(ThrottlerGuard, RefreshJwtGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    operationId: 'postAuthRefresh',
    summary: 'Cấp access token mới từ refresh token',
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
    @CurrentUser() user: AuthenticatedUser,
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
    summary: 'Đăng xuất và xóa refresh-token cookie',
  })
  @ApiBearerAuth('BearerAuth')
  @ApiOkResponse({ type: MessageSuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  logout(@Res({ passthrough: true }) response: Response): { message: string } {
    response.clearCookie('refreshToken', this.refreshCookieOptions(false));
    return { message: 'Thao tác thành công.' };
  }

  @Patch('change-password')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    operationId: 'patchAuthChangePassword',
    summary: 'Đổi mật khẩu của tài khoản đang đăng nhập',
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
