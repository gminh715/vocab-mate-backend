import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { requestLoggingMiddleware } from '../../../../src/common/logging/request-logging.middleware';

describe('request logging middleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns and logs one correlation identifier with request metadata', () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const responseEvents = new EventEmitter();
    const setHeader = jest.fn();
    const response = Object.assign(responseEvents, {
      setHeader,
      statusCode: 201,
    }) as unknown as Response;
    const request = {
      headers: { 'x-request-id': 'request-123' },
      method: 'POST',
      baseUrl: '/api/v1/vocabularies',
      path: '/api/v1/vocabularies',
      user: { id: 'user-123' },
    } as unknown as Request;
    const next = jest.fn<ReturnType<NextFunction>, Parameters<NextFunction>>();

    requestLoggingMiddleware(request, response, next);
    responseEvents.emit('finish');

    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'request-123');
    expect(next).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(String(write.mock.calls[0]?.[0]));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('Expected a structured request log record');
    }
    expect(parsed).toMatchObject({
      event: 'http.request.completed',
      requestId: 'request-123',
      httpMethod: 'POST',
      route: '/api/v1/vocabularies',
      responseStatus: 201,
      userId: 'user-123',
    });
  });
});
