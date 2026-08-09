export type AiErrorCode =
  'INVALID_INPUT' | 'CONFIGURATION_FAILURE' | 'PROVIDER_UNAVAILABLE';

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly providerFailureReason?: ProviderFailureReason,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export type ProviderFailureReason =
  | 'timeout'
  | 'network'
  | 'rate-limit'
  | 'server'
  | 'configuration'
  | 'request'
  | 'unusable-output';

export class ProviderCallError extends Error {
  constructor(readonly reason: ProviderFailureReason) {
    super('AI provider request failed');
    this.name = 'ProviderCallError';
  }
}

export const isFallbackEligible = (reason: ProviderFailureReason): boolean =>
  reason === 'timeout' ||
  reason === 'network' ||
  reason === 'rate-limit' ||
  reason === 'server' ||
  reason === 'request' ||
  reason === 'unusable-output';
