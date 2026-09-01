import { SetMetadata } from '@nestjs/common';

export const SKIP_SUCCESS_RESPONSE_ENVELOPE =
  'skipSuccessResponseEnvelope' as const;

export const SkipSuccessResponseEnvelope = (): MethodDecorator &
  ClassDecorator => SetMetadata(SKIP_SUCCESS_RESPONSE_ENVELOPE, true);
