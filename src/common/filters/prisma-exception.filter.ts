import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = this.mapException(exception);
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = mapped.getStatus();
    response.status(status).json(mapped.getResponse());
  }

  private mapException(exception: Prisma.PrismaClientKnownRequestError): HttpException {
    switch (exception.code) {
      case 'P2002': {
        const target = Array.isArray(exception.meta?.target)
          ? (exception.meta.target as string[]).join(', ')
          : String(exception.meta?.target ?? 'campo único');
        return new ConflictException(`Ya existe un registro con ese valor en: ${target}.`);
      }
      case 'P2025':
        return new NotFoundException('Registro no encontrado.');
      default:
        this.logger.error(`Prisma error no mapeado: ${exception.code}`, exception.message);
        return new InternalServerErrorException('Error interno del servidor.');
    }
  }
}
