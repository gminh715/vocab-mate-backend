export type NewsIngestionErrorCode =
  | 'NEWS_PROVIDER_BAD_REQUEST'
  | 'NEWS_PROVIDER_AUTHENTICATION'
  | 'NEWS_PROVIDER_QUOTA'
  | 'NEWS_PROVIDER_RATE_LIMIT'
  | 'NEWS_PROVIDER_UPSTREAM'
  | 'NEWS_PROVIDER_NETWORK'
  | 'NEWS_PROVIDER_TIMEOUT'
  | 'NEWS_PROVIDER_INVALID_RESPONSE'
  | 'NEWS_PROVIDER_RESPONSE_TOO_LARGE'
  | 'GUARDIAN_BODY_UNAVAILABLE'
  | 'INVALID_URL';

export class NewsIngestionError extends Error {
  constructor(
    readonly code: NewsIngestionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NewsIngestionError';
  }
}
