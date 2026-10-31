export const AUDIT_LOG = Symbol('AUDIT_LOG');

// Registro de auditoría del panel admin. Lo implementa el módulo audit; los
// demás módulos solo conocen esta interfaz, nunca a AuditService.
export interface AuditLogPort {
  log(
    accion: string,
    entidad: string,
    entidadId: string,
    descripcion: string,
    userId?: string,
  ): Promise<void>;
}
