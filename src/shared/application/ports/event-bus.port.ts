import type { DomainEvent, DomainEventType } from '../../domain/domain-event';

export const EVENT_BUS = Symbol('EVENT_BUS');

/**
 * Cuándo corre un handler respecto de la transacción del publicador:
 *
 * - `in-transaction`: dentro de la misma unidad de trabajo, en orden y
 *   esperado. Si el handler lanza, se revierte todo. Es para efectos que
 *   deben ser atómicos con el cambio original (p. ej. descontar stock al
 *   confirmar un pedido).
 * - `after-commit`: solo si la transacción se confirmó, sin bloquear la
 *   respuesta y sin poder revertirla. Es para efectos externos (correos,
 *   Meta): nunca se envía un correo de un pedido que terminó en rollback.
 *
 * Sin transacción activa, `in-transaction` corre en línea y `after-commit`
 * se dispara de inmediato.
 */
export type EventPhase = 'in-transaction' | 'after-commit';

export type EventHandler<E extends DomainEvent> = (
  event: E,
) => Promise<void> | void;

export interface EventBusPort {
  publish(...events: DomainEvent[]): Promise<void>;
  subscribe<E extends DomainEvent>(
    type: DomainEventType<E>,
    handler: EventHandler<E>,
    phase: EventPhase,
  ): void;
}
