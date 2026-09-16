import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser = require('cookie-parser');

import { AppModule } from './app.module';
import { isProduction } from './config/app-env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = Number(configService.get<string>('BACKEND_PORT') ?? 3000);
  const corsOrigin = configService.get<string>('CORS_ORIGIN');

  app.use(helmet());
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      disableErrorMessages: isProduction(configService),
    }),
  );

  if (corsOrigin) {
    app.enableCors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    });
  }

  if (!isProduction(configService)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RIFT API')
      .setDescription('RIFT backend HTTP API')
      .setVersion('1.0.0')
      .addTag('Authentication', 'Registration, login, and session renewal')
      .addTag('Users', 'Current user and active sessions')
      .addTag('Health', 'Service health checks')
      .addCookieAuth(
        'rift_access',
        {
          type: 'apiKey',
          description:
            'Access JWT is set by POST /auth/login or POST /auth/register.',
        },
        'accessCookie',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      operationIdFactory: (controller, method) => `${controller}_${method}`,
    });

    SwaggerModule.setup('docs', app, document, {
      useGlobalPrefix: true,
      customSiteTitle: 'RIFT API Docs',
      swaggerOptions: {
        displayOperationId: true,
        persistAuthorization: true,
      },
    });
  }

  app.enableShutdownHooks();

  await app.listen(port);
}
void bootstrap();
