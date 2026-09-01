import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { SKIP_SUCCESS_RESPONSE_ENVELOPE } from '../decorators/skip-success-response-envelope.decorator';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiSuccessResponseWithMeta<
  T,
  M,
> extends ApiSuccessResponse<T> {
  meta: M;
}

class ResponseDataWithMeta {
  constructor(
    readonly data: unknown,
    readonly meta: unknown,
  ) {}
}

export const responseDataWithMeta = <T, M>(
  data: T,
  meta: M,
): ResponseDataWithMeta => new ResponseDataWithMeta(data, meta);

@Injectable()
export class SuccessResponseInterceptor<T> implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<
    T | ApiSuccessResponse<T> | ApiSuccessResponseWithMeta<unknown, unknown>
  > {
    const skipEnvelope = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUCCESS_RESPONSE_ENVELOPE,
      [context.getHandler(), context.getClass()],
    );

    if (skipEnvelope) {
      return next.handle();
    }

    return next
      .handle()
      .pipe(
        map((result) =>
          result instanceof ResponseDataWithMeta
            ? { success: true as const, data: result.data, meta: result.meta }
            : { success: true as const, data: result },
        ),
      );
  }
}
