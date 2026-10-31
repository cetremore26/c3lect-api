// Errores de negocio sin dependencia de HTTP. El dominio y los casos de uso
// lanzan estos; GlobalExceptionFilter los traduce al status correspondiente.
// Así una regla como "no se puede pasar de ENTREGADO a PENDIENTE" no sabe que
// existe un BadRequestException ni un protocolo HTTP.
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Se intentó algo que las reglas de negocio no permiten (→ 400). */
export class BusinessRuleViolation extends DomainError {}

/** La entidad pedida no existe (→ 404). */
export class NotFoundError extends DomainError {}

/** Credenciales o token inválidos (→ 401). */
export class UnauthorizedError extends DomainError {}

/** Quien pide la operación no tiene permiso sobre esa entidad (→ 403). */
export class ForbiddenError extends DomainError {}

/** El estado actual choca con lo pedido, p. ej. un duplicado (→ 409). */
export class ConflictError extends DomainError {}
