import type { NextFunction, Request, Response } from 'express';
import { resolveRequestId, runWithRequestContext } from './request-context';
import { logInfo } from './structured-logger';

const routeFor = (request: Request): string => {
  const routePath = (request as unknown as { route?: { path?: unknown } }).route
    ?.path;
  if (typeof routePath === 'string') return `${request.baseUrl}${routePath}`;
  return request.path;
};

const userIdFor = (request: Request): string | undefined => {
  const user = (request as unknown as { user?: unknown }).user;
  if (typeof user !== 'object' || user === null) return undefined;
  const id = (user as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
};

export const requestLoggingMiddleware = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const requestId = resolveRequestId(request.headers['x-request-id']);
  const startedAt = process.hrtime.bigint();
  response.setHeader('X-Request-Id', requestId);

  runWithRequestContext({ requestId }, () => {
    response.once('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const userId = userIdFor(request);
      logInfo('http.request.completed', {
        requestId,
        httpMethod: request.method,
        route: routeFor(request),
        responseStatus: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ...(userId ? { userId } : {}),
      });
    });
    next();
  });
};
