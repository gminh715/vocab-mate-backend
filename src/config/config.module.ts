import 'dotenv/config';
import { Global, Module } from '@nestjs/common';
import { aiConfig } from './ai.config';
import { appConfig } from './app.config';
import { authConfig } from './auth.config';
import { cloudinaryConfig } from './cloudinary.config';
import { databaseConfig } from './database.config';
import { newsConfig } from './news.config';

export const AI_CONFIG = 'AI_CONFIG';
export const APP_CONFIG = 'APP_CONFIG';
export const AUTH_CONFIG = 'AUTH_CONFIG';
export const CLOUDINARY_CONFIG = 'CLOUDINARY_CONFIG';
export const DATABASE_CONFIG = 'DATABASE_CONFIG';
export const NEWS_CONFIG = 'NEWS_CONFIG';

const configProviders = [
  { provide: AI_CONFIG, useFactory: aiConfig },
  { provide: APP_CONFIG, useFactory: appConfig },
  { provide: AUTH_CONFIG, useFactory: authConfig },
  { provide: CLOUDINARY_CONFIG, useFactory: cloudinaryConfig },
  { provide: DATABASE_CONFIG, useFactory: databaseConfig },
  { provide: NEWS_CONFIG, useFactory: newsConfig },
];

@Global()
@Module({
  providers: configProviders,
  exports: configProviders,
})
export class ConfigModule {}
