import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipSuccessResponseEnvelope } from '../../common/decorators/skip-success-response-envelope.decorator';
import { HealthService } from './health.service';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
@SkipSuccessResponseEnvelope()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  ready(): Promise<{ status: 'ok' }> {
    return this.healthService.getReadiness();
  }
}
