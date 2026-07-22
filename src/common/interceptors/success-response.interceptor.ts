import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

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
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<
    ApiSuccessResponse<T> | ApiSuccessResponseWithMeta<unknown, unknown>
  > {
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
