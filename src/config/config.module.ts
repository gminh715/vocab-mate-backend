import 'dotenv/config';
import { Global, Module } from '@nestjs/common';
import { appConfig } from './app.config';
import { authConfig } from './auth.config';
import { databaseConfig } from './database.config';

export const APP_CONFIG = 'APP_CONFIG';
export const AUTH_CONFIG = 'AUTH_CONFIG';
export const DATABASE_CONFIG = 'DATABASE_CONFIG';

const configProviders = [
  { provide: APP_CONFIG, useFactory: appConfig },
  { provide: AUTH_CONFIG, useFactory: authConfig },
  { provide: DATABASE_CONFIG, useFactory: databaseConfig },
];

@Global()
@Module({
  providers: configProviders,
  exports: configProviders,
})
export class ConfigModule {}
