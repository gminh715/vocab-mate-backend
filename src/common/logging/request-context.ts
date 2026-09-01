import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestLogContext {
  requestId: string;
}

const requestContext = new AsyncLocalStorage<RequestLogContext>();
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export const resolveRequestId = (
  value: string | string[] | undefined,
): string => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();
};

export const runWithRequestContext = <T>(
  context: RequestLogContext,
  callback: () => T,
): T => requestContext.run(context, callback);

export const getRequestLogContext = (): RequestLogContext | undefined =>
  requestContext.getStore();
