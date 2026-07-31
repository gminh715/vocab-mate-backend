import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from '../../common/interceptors/success-response.interceptor';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../auth/dto/auth-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AdminNewsSearchQueryDto,
  AdminNewsSyncDto,
} from './dto/admin-news.dto';
import {
  AdminNewsSearchSuccessResponseDto,
  AdminNewsSyncSuccessResponseDto,
} from './dto/admin-news-response.dto';
import { NewsIngestionService } from './news-ingestion.service';

@ApiTags('Admin News')
@Controller('admin/news')
@UseInterceptors(SuccessResponseInterceptor)
@UseFilters(ApiExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class AdminNewsController {
  constructor(private readonly newsIngestionService: NewsIngestionService) {}

  @Get('search')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getAdminNewsSearch',
    summary: 'Discover normalized Guardian articles',
    description:
      'ADMIN-only Guardian Content API discovery. Returns bounded normalized metadata and attribution/source links without requesting or exposing fields.body.',
  })
  @ApiOkResponse({ type: AdminNewsSearchSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
  @ApiBadGatewayResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  search(@Query() query: AdminNewsSearchQueryDto) {
    return this.newsIngestionService.search(query);
  }

  @Post('sync')
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'postAdminNewsSync',
    summary: 'Import discovered Guardian news as parsed drafts',
    description:
      'Requests at most five Guardian articles with fields.body once, validates and sanitizes each usable body, imports each independently as a parsed DRAFT, and returns per-item imported, duplicate, or failed status. An unusable body fails safely. It never requests or scrapes publisher pages and never publishes.',
  })
  @ApiCreatedResponse({ type: AdminNewsSyncSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
  @ApiBadGatewayResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  sync(
    @CurrentUser() actingAdmin: AuthenticatedUser,
    @Body() dto: AdminNewsSyncDto,
  ) {
    return this.newsIngestionService.sync(actingAdmin.id, dto);
  }
}
