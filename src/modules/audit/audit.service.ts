import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // El JWT solo lleva {id, email, rol} — nunca el nombre (ver auth.service.ts /
  // jwt.strategy.ts) — así que resolverlo acá, a partir del userId, es la única
  // forma confiable de que quede guardado quién hizo el cambio. Antes cada
  // caller intentaba pasar un "userName" que en la práctica siempre llegaba
  // undefined porque no existía en ningún lado de donde sacarlo.
  async log(
    accion: string,
    entidad: string,
    entidadId: string,
    descripcion: string,
    userId?: string,
  ) {
    const userName = userId
      ? (
          await this.prisma.user.findUnique({
            where: { id: userId },
            select: { nombre: true },
          })
        )?.nombre
      : undefined;

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
