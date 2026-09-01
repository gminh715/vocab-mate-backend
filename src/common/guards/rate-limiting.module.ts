import { Global, Module } from '@nestjs/common';
import { AuthenticatedUserThrottlerGuard } from './authenticated-user-throttler.guard';

@Global()
@Module({
  providers: [AuthenticatedUserThrottlerGuard],
  exports: [AuthenticatedUserThrottlerGuard],
})
export class RateLimitingModule {}
