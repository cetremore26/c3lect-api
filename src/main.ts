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

  // FRONTEND_URL puede incluir un path (ej. GitHub Pages: /boveda-c3lect-v2)
  // porque también se usa para armar links completos (reset de password,
  // back_urls de MercadoPago). El header Origin del navegador nunca trae
  // path, así que CORS debe comparar solo contra el origen.
  const frontendUrl = config.get<string>('FRONTEND_URL');
  // CORS_EXTRA_ORIGINS: lista separada por comas de orígenes adicionales a
  // permitir sin reemplazar FRONTEND_URL (ej. la URL *.pages.dev mientras se
  // prueba la migración a Cloudflare Pages, antes de mover el DNS). Se quita
  // una vez el corte de dominio esté completo.
  const extraOrigins = (config.get<string>('CORS_EXTRA_ORIGINS') ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const corsOrigins = [frontendUrl, ...extraOrigins]
    .filter(Boolean)
    .map((url) => new URL(url as string).origin);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : undefined,
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

  // Deja que un SIGTERM/SIGINT (ej. redeploy de Render) cierre el servidor y
  // desconecte Prisma de forma ordenada en vez de cortar a mitad de una escritura.
  app.enableShutdownHooks();

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

bootstrap();
