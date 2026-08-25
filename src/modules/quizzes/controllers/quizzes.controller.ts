import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../../../common/dto/api-error-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { GetQuizzesQueryDto, QuizParamsDto } from '../dto/quiz-request.dto';
import {
  PublicQuizDetailSuccessResponseDto,
  PublicQuizListSuccessResponseDto,
} from '../dto/quiz-response.dto';
import { QuizzesService } from '../services/quizzes.service';

@ApiTags('Quizzes')
@Controller('quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@ApiBearerAuth('BearerAuth')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getQuizzes',
    summary: 'List published quizzes',
    description:
      'Authenticated USER or ADMIN endpoint. Only quizzes attached to published articles are returned. Questions and answer data are excluded.',
  })
  @ApiOkResponse({ type: PublicQuizListSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findAll(@Query() query: GetQuizzesQueryDto) {
    return this.quizzesService.findAll(query);
  }

  @Get(':quizId')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getQuizzesByQuizId',
    summary: 'Get published quiz metadata and active-question totals',
    description:
      'Authenticated USER or ADMIN endpoint. Draft, archived, inaccessible, and missing quizzes share the same not-found response. Question content and answers are excluded.',
  })
  @ApiOkResponse({ type: PublicQuizDetailSuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  findOne(@Param() params: QuizParamsDto) {
    return this.quizzesService.findOne(params.quizId);
  }
}
