export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

export interface AuditEntry {
  accion: string;
  entidad: string;
  entidadId: string;
  descripcion: string;
  userId?: string;
  userName?: string;
}

export interface AuditRecord extends AuditEntry {
  id: string;
  createdAt: Date;
}

export interface AuditFilter {
  accion?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
}

export interface AuditRepositoryPort {
  create(entry: AuditEntry): Promise<void>;
  findMany(
    filter: AuditFilter,
    skip: number,
    take: number,
  ): Promise<{ data: AuditRecord[]; total: number }>;
}
