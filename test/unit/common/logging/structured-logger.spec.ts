import {
  getRequestLogContext,
  resolveRequestId,
  runWithRequestContext,
} from '../../../../src/common/logging/request-context';
import { logInfo } from '../../../../src/common/logging/structured-logger';

describe('structured logger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves a valid request identifier and generates one for invalid input', () => {
    expect(resolveRequestId('request-123')).toBe('request-123');
    expect(resolveRequestId('contains spaces')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
  });

  it('writes correlated JSON records while redacting credentials and prompt content', () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    runWithRequestContext({ requestId: 'request-123' }, () => {
      expect(getRequestLogContext()).toEqual({ requestId: 'request-123' });
      logInfo('test.operation', {
        apiKey: 'api-key-value',
        prompt: 'private learner text',
        providerError:
          'Request failed at https://provider.example/v1?api-key=api-key-value',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
      });
    });

    const parsed: unknown = JSON.parse(String(write.mock.calls[0]?.[0]));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('Expected a structured log record');
    }
    const record = parsed;
    expect(record).toMatchObject({
      event: 'test.operation',
      requestId: 'request-123',
      apiKey: '[REDACTED]',
      prompt: '[REDACTED]',
      authorization: '[REDACTED]',
      providerError: 'Request failed at https://provider.example/v1',
    });
    expect(JSON.stringify(record)).not.toContain('api-key-value');
    expect(JSON.stringify(record)).not.toContain('private learner text');
  });
});
