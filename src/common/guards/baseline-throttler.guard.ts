import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

export const BASELINE_RATE_LIMIT = {
  limit: 120,
  ttl: 60000,
} as const;

@Injectable()
export class BaselineThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions()
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await this.shouldSkip(context)) return true;

    const defaultThrottler = this.throttlers.find(
      ({ name }) => name === 'default',
    );
    if (!defaultThrottler) return true;

    return this.handleRequest({
      context,
      limit: BASELINE_RATE_LIMIT.limit,
      ttl: BASELINE_RATE_LIMIT.ttl,
      throttler: defaultThrottler,
      blockDuration: BASELINE_RATE_LIMIT.ttl,
      getTracker: this.commonOptions.getTracker ?? this.getTracker.bind(this),
      generateKey:
        this.commonOptions.generateKey ?? this.generateKey.bind(this),
    });
  }
}
