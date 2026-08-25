import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  MyAccountSuccessResponseDto,
  UpdateMyProfileSuccessResponseDto,
} from '../dto/my-profile-response.dto';
import { UpdateMyProfileDto } from '../dto/update-my-profile.dto';
import { UsersService } from '../users.service';

/**
 * HTTP boundary for the authenticated user's own account and profile.
 * The verified JWT identity is the only source of the user ID.
 */
@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('BearerAuth')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getUsersMe',
    summary: 'Get the current account and learning profile',
    description:
      'Returns current account data from the database using the authenticated JWT identity.',
  })
  @ApiOkResponse({ type: MyAccountSuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'patchUsersMe',
    summary: 'Update the current learning profile',
    description:
      'Partially updates only profile fields owned by the authenticated user.',
  })
  @ApiOkResponse({ type: UpdateMyProfileSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.usersService.updateMe(user.id, dto);
  }
}
