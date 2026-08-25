import { getRequestLogContext } from './request-context';

type StructuredLogLevel = 'error' | 'info' | 'warn';
type StructuredLogMetadata = Record<string, unknown>;

const SENSITIVE_KEY =
  /^(?:api[-_]?key|authorization|cookies?|credentials?|jwt|password(?:hash)?|prompt|refresh[-_]?token|secret|access[-_]?token|id[-_]?token|token|usercontent)$/iu;
const BEARER_TOKEN = /\bBearer\s+[^\s,;]+/giu;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const EXTERNAL_URL = /https?:\/\/[^\s'"<>]+/giu;

const redactUrl = (value: string): string => {
  try {
    const url = new globalThis.URL(value);
    return url.search ? `${url.origin}${url.pathname}` : value;
  } catch {
    return value;
  }
};

const redactString = (value: string): string =>
  value
    .replace(EXTERNAL_URL, redactUrl)
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
    .replace(JWT, '[REDACTED]');

const sanitize = (value: unknown, depth = 0): unknown => {
  if (depth > 5) return '[TRUNCATED]';
  if (typeof value === 'string') return redactString(value);
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }
  if (typeof value !== 'object') return `[${typeof value}]`;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(item, depth + 1),
    ]),
  );
};

const write = (
  level: StructuredLogLevel,
  event: string,
  metadata: StructuredLogMetadata = {},
): void => {
  const context = getRequestLogContext();
  const sanitizedMetadata = sanitize(metadata);
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(context ? { requestId: context.requestId } : {}),
    ...(typeof sanitizedMetadata === 'object' && sanitizedMetadata !== null
      ? sanitizedMetadata
      : {}),
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
};

export const logInfo = (
  event: string,
  metadata?: StructuredLogMetadata,
): void => write('info', event, metadata);

export const logWarn = (
  event: string,
  metadata?: StructuredLogMetadata,
): void => write('warn', event, metadata);

export const logError = (
  event: string,
  metadata?: StructuredLogMetadata,
): void => write('error', event, metadata);
