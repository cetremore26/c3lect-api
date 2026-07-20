import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Render agrega un solo hop de proxy delante de la app: confiar solo en ese
  // hop hace que req.ip refleje la IP real del cliente (vía X-Forwarded-For)
  // sin aceptar ciegamente un header falsificado por el cliente.
  app.set('trust proxy', 1);

  app.use(helmet());

  app.enableCors({
    origin: config.get<string>('FRONTEND_URL'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('C3LECT API')
    .setDescription('Backend para la plataforma de comercio electrónico premium C3LECT — Relojería y Perfumería')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

bootstrap();
