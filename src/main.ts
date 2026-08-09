import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './app.setup';
import { APP_CONFIG } from './config/config.module';
import type { ReturnTypeOfAppConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ReturnTypeOfAppConfig>(APP_CONFIG);

  configureApp(app, config.corsOrigins);
  setupSwagger(app);

  await app.listen(config.port);
}

void bootstrap();
