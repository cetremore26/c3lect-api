import type { DomainEvent } from '../../../shared/domain/domain-event';

// Hechos del contexto de identidad. Notificaciones envía los correos y orders
// vincula a la cuenta nueva los pedidos hechos como invitado.

export class UsuarioRegistrado implements DomainEvent {
  static readonly NAME = 'auth.usuario-registrado';
  readonly name = UsuarioRegistrado.NAME;

  constructor(
    readonly usuario: { userId: string; email: string; nombre: string },
  ) {}
}

export class CodigoDeAccesoSolicitado implements DomainEvent {
  static readonly NAME = 'auth.codigo-de-acceso-solicitado';
  readonly name = CodigoDeAccesoSolicitado.NAME;

  constructor(readonly solicitud: { email: string; codigo: string }) {}
}

export class RestablecimientoDeClaveSolicitado implements DomainEvent {
  static readonly NAME = 'auth.restablecimiento-solicitado';
  readonly name = RestablecimientoDeClaveSolicitado.NAME;

  constructor(readonly solicitud: { email: string; resetUrl: string }) {}
}
