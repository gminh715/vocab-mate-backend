import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  GetDueReviewsQueryDto,
  GetReviewHistoryQueryDto,
} from '../dto/review-request.dto';
import {
  DueReviewsSuccessResponseDto,
  ReviewHistorySuccessResponseDto,
} from '../dto/review-response.dto';
import { ReviewsService } from '../services/reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('today')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getTodaysReviews',
    summary: "Get today's due vocabulary and review recommendations",
  })
  @ApiOkResponse({ type: DueReviewsSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetDueReviewsQueryDto,
  ) {
    return this.reviewsService.getToday(user.id, query);
  }

  @Get('history')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReviewHistory',
    summary: 'List owned review-session history',
  })
  @ApiOkResponse({ type: ReviewHistorySuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetReviewHistoryQueryDto,
  ) {
    return this.reviewsService.getHistory(user.id, query);
  }

  @Get('due')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getDueReviews',
    summary: 'Get due review recommendations (deprecated; use /reviews/today)',
    deprecated: true,
  })
  @ApiOkResponse({ type: DueReviewsSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getDue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetDueReviewsQueryDto,
  ) {
    return this.reviewsService.getToday(user.id, query);
  }
}
