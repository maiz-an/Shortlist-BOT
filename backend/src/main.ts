import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/utils/json-logger';

async function bootstrap() {
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, { logger });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  app.enableCors({
    origin: config.get<string>('FRONTEND_URL', 'http://localhost:5870').split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Token'],
  });

  if (!config.get('API_TOKEN')) logger.warn('API_TOKEN is not set: the local API is unauthenticated', 'Bootstrap');
  if (!config.get('TOKEN_ENCRYPTION_KEY')) logger.warn('TOKEN_ENCRYPTION_KEY is not set: Gmail cannot be connected', 'Bootstrap');

  const port = Number(config.get('PORT', 5871));
  await app.listen(port, config.get<string>('HOST', '127.0.0.1'));
  logger.log(`Backend listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
