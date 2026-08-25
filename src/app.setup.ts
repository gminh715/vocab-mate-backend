import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { SuccessResponseInterceptor } from './common/interceptors/success-response.interceptor';

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://vocab-mate.onrender.com',
];

export const configureApp = (
  app: INestApplication,
  corsOrigins?: string[],
): void => {
  const standardSecurityHeaders = helmet();
  const swaggerSecurityHeaders = helmet({
    // Swagger UI renders inline bootstrap code. Keep the CSP exception scoped
    // to the documentation route while retaining Helmet's other protections.
    contentSecurityPolicy: false,
  });

  app.use((request: Request, response: Response, next: NextFunction) => {
    const securityHeaders = request.originalUrl.startsWith('/api/docs')
      ? swaggerSecurityHeaders
      : standardSecurityHeaders;

    securityHeaders(request, response, next);
  });
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableCors({
    origin:
      corsOrigins && corsOrigins.length > 0
        ? corsOrigins
        : defaultAllowedOrigins,
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new SuccessResponseInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new ApiExceptionFilter());
};

export const setupSwagger = (app: INestApplication): OpenAPIObject => {
  const config = new DocumentBuilder()
    .setTitle('Vocab Mate MVP API')
    .setDescription('REST API for the Vocab Mate MVP')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'BearerAuth',
    )
    .addCookieAuth(
      'refreshToken',
      { type: 'apiKey', in: 'cookie' },
      'CookieAuth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  return document;
};
