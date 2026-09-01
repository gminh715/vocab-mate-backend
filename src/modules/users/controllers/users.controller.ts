import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { UsersService } from '../services/users.service';

const avatarUploadOptions = {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!file.mimetype.match(/^image\/(jpeg|png|webp|gif|jpg)$/)) {
      return callback(
        new BadRequestException(
          'Only image files (JPG, PNG, WEBP, GIF) are allowed',
        ),
        false,
      );
    }
    callback(null, true);
  },
};

/**
 * HTTP boundary for the authenticated user's own account and learning settings.
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
    summary: 'Get the current account and learning settings',
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
    summary: 'Update the current learning settings',
    description:
      'Partially updates only learning settings owned by the authenticated user.',
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

  @Post('me/avatar')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', avatarUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (max 5MB, JPG/PNG/WEBP/GIF)',
        },
      },
      required: ['file'],
    },
  })
  @ApiOperation({
    operationId: 'uploadMyAvatar',
    summary: 'Upload an avatar image for the authenticated user',
    description:
      'Receives an image via Multer, uploads it to Cloudinary (or fallback storage), and updates avatarUrl.',
  })
  @ApiOkResponse({ type: UpdateMyProfileSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Avatar image file is required');
    }
    return this.usersService.uploadAvatar(user.id, file);
  }
}
