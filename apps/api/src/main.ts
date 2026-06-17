import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertProductionDatabaseConfig, resolveCorsOrigin } from './auth/security-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  assertProductionDatabaseConfig(config);
  app.enableCors({ origin: resolveCorsOrigin(config), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(Number(config.get('PORT') ?? config.get('API_PORT') ?? 4000));
}

bootstrap();
