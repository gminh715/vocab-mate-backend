import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Triggers the local (email + password) strategy for the login route. */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
