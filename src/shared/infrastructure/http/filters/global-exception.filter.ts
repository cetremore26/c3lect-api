import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../../domain/domain-error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const mapped = this.mapException(exception);
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = mapped.getStatus();
    response.status(status).json(mapped.getResponse());
  }

  private mapException(exception: unknown): HttpException {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaException(exception);
    }

    if (exception instanceof DomainError) {
      return this.mapDomainError(exception);
    }

    if (exception instanceof HttpException) {
      // Errores intencionales (ConflictException, NotFoundException, BadRequestException, etc.)
      // ya lanzados a propósito por los services — son parte del flujo normal, no fallos, así
      // que se dejan pasar tal cual sin loguear ruido. Solo se loguean los 5xx inesperados.
      if (exception.getStatus() >= 500) {
        this.logger.error(exception.message, exception.stack);
      }
      return exception;
    }

    const stack =
      exception instanceof Error ? exception.stack : String(exception);
    this.logger.error('Error no controlado', stack);
    return new InternalServerErrorException('Error interno del servidor.');
  }

  // Los errores de negocio se lanzan sin saber nada de HTTP (ver
  // shared/domain/domain-error.ts); la traducción a status vive solo aquí.
  private mapDomainError(error: DomainError): HttpException {
    if (error instanceof NotFoundError)
      return new NotFoundException(error.message);
    if (error instanceof UnauthorizedError)
      return new UnauthorizedException(error.message);
    if (error instanceof ForbiddenError)
      return new ForbiddenException(error.message);
    if (error instanceof ConflictError)
      return new ConflictException(error.message);
    return new BadRequestException(error.message);
  }

  private mapPrismaException(
    exception: Prisma.PrismaClientKnownRequestError,
  ): HttpException {
    switch (exception.code) {
      case 'P2002': {
        const metaTarget = exception.meta?.target;
        const target = Array.isArray(metaTarget)
          ? (metaTarget as string[]).join(', ')
          : typeof metaTarget === 'string'
            ? metaTarget
            : 'campo único';
        return new ConflictException(
          `Ya existe un registro con ese valor en: ${target}.`,
        );
      }
      case 'P2025':
        return new NotFoundException('Registro no encontrado.');
      default:
        this.logger.error(
          `Prisma error no mapeado: ${exception.code}`,
          exception.message,
        );
        return new InternalServerErrorException('Error interno del servidor.');
    }
  }
}
