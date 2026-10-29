import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  AuditEntry,
  AuditFilter,
  AuditRecord,
  AuditRepositoryPort,
} from '../../application/ports/audit-repository.port';

@Injectable()
export class PrismaAuditRepository implements AuditRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  async create(entry: AuditEntry): Promise<void> {
    await this.db.client.auditLog.create({ data: entry });
  }

  async findMany(filter: AuditFilter, skip: number, take: number) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filter.accion) where.accion = filter.accion;
    if (filter.fechaDesde || filter.fechaHasta) {
      where.createdAt = {
        ...(filter.fechaDesde ? { gte: filter.fechaDesde } : {}),
        ...(filter.fechaHasta ? { lte: filter.fechaHasta } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.db.client.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.client.auditLog.count({ where }),
    ]);

    return { data: data as AuditRecord[], total };
  }
}
