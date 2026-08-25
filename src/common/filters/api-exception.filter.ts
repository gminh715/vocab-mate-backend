import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { logError } from '../logging/structured-logger';

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string[];
    issues?: Array<{
      code: string;
      message: string;
      entityId?: string;
    }>;
  };
}

interface StructuredIssue {
  code: string;
  message: string;
  entityId?: string;
}

const isStructuredIssue = (value: unknown): value is StructuredIssue =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  typeof value.code === 'string' &&
  'message' in value &&
  typeof value.message === 'string' &&
  (!('entityId' in value) ||
    value.entityId === undefined ||
    typeof value.entityId === 'string');

const errorCodes: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const isInternalServerError = status === 500;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const messages =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse &&
      Array.isArray(exceptionResponse.message)
        ? exceptionResponse.message.filter(
            (message): message is string => typeof message === 'string',
          )
        : undefined;
    const rawIssues: unknown =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'issues' in exceptionResponse
        ? exceptionResponse.issues
        : undefined;
    const issues = Array.isArray(rawIssues)
      ? (rawIssues as unknown[])
          .filter(isStructuredIssue)
          .map(({ code, message, entityId }) => ({
            code,
            message,
            ...(entityId ? { entityId } : {}),
          }))
      : undefined;
    const responseMessage =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse &&
      typeof exceptionResponse.message === 'string'
        ? exceptionResponse.message
        : undefined;
    const message = isInternalServerError
      ? 'Internal server error'
      : messages
        ? 'Validation failed'
        : responseMessage
          ? responseMessage
          : exception instanceof HttpException
            ? exception.message
            : 'Internal server error';

    if (isInternalServerError) {
      logError('http.request.unhandled_error', {
        errorName: exception instanceof Error ? exception.name : 'UnknownError',
      });
    }

    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: errorCodes[status] ?? 'INTERNAL_SERVER_ERROR',
        message,
        ...(messages ? { details: messages } : {}),
        ...(issues ? { issues } : {}),
      },
    };

    response.status(status).json(body);
  }
}
