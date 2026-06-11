import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    accion: string,
    entidad: string,
    entidadId: string,
    descripcion: string,
    userId?: string,
    userName?: string,
  ) {
    await this.prisma.auditLog.create({
      data: { accion, entidad, entidadId, descripcion, userId, userName },
    });
  }

  async findAll(query: QueryAuditDto) {
    const { accion, fechaDesde, fechaHasta, page = 1, limit = 30 } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (accion) where.accion = accion;
    if (fechaDesde || fechaHasta) {
      where.createdAt = {
        ...(fechaDesde ? { gte: new Date(fechaDesde) } : {}),
        ...(fechaHasta ? { lte: new Date(fechaHasta + 'T23:59:59Z') } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
