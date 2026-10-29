import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import { AUDIT_REPOSITORY } from './ports/audit-repository.port';
import type { AuditRepositoryPort } from './ports/audit-repository.port';
import { USER_DIRECTORY } from './ports/user-directory.port';
import type { UserDirectoryPort } from './ports/user-directory.port';

export interface AuditQuery {
  accion?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService implements AuditLogPort {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly audits: AuditRepositoryPort,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectoryPort,
  ) {}

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
  ): Promise<void> {
    const userName = userId ? await this.users.findNombre(userId) : undefined;
    await this.audits.create({
      accion,
      entidad,
      entidadId,
      descripcion,
      userId,
      userName,
    });
  }

  async findAll(query: AuditQuery) {
    const { accion, fechaDesde, fechaHasta, page = 1, limit = 30 } = query;
    const skip = (page - 1) * limit;

    const { data, total } = await this.audits.findMany(
      {
        accion,
        fechaDesde: fechaDesde ? new Date(fechaDesde) : undefined,
        fechaHasta: fechaHasta
          ? new Date(fechaHasta + 'T23:59:59Z')
          : undefined,
      },
      skip,
      limit,
    );

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
