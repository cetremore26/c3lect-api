import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent, DomainEventType } from '../../domain/domain-event';
import type {
  EventBusPort,
  EventHandler,
  EventPhase,
} from '../../application/ports/event-bus.port';
import { PrismaTransactionHost } from '../prisma/prisma-transaction.host';

interface Subscription {
  handler: EventHandler<DomainEvent>;
  phase: EventPhase;
}

// Bus in-process y síncrono respecto de la transacción. Se prefirió sobre
// @nestjs/event-emitter porque aquel corre los listeners en paralelo
// (Promise.all) y por defecto se traga sus errores: aquí un handler
// `in-transaction` que lanza (p. ej. stock insuficiente) DEBE abortar la
// transacción del publicador, y los handlers deben correr en orden sobre el
// mismo cliente transaccional.
//
// Si un día un módulo se extrae a microservicio, este es el adaptador que se
// cambia por uno de RabbitMQ/SQS: publicadores y handlers no se enteran.
@Injectable()
export class InProcessEventBus implements EventBusPort {
  private readonly logger = new Logger(InProcessEventBus.name);
  private readonly subscriptions = new Map<string, Subscription[]>();

  constructor(private readonly tx: PrismaTransactionHost) {}

  subscribe<E extends DomainEvent>(
    type: DomainEventType<E>,
    handler: EventHandler<E>,
    phase: EventPhase,
  ): void {
    const list = this.subscriptions.get(type.NAME) ?? [];
    list.push({ handler: handler, phase });
    this.subscriptions.set(type.NAME, list);
  }

  async publish(...events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const { handler, phase } of this.subscriptions.get(event.name) ??
        []) {
        if (phase === 'in-transaction') {
          await handler(event);
        } else {
          this.tx.afterCommit(() => {
            Promise.resolve()
              .then(() => handler(event))
              .catch((err) =>
                this.logger.error(
                  `Handler after-commit de ${event.name} falló`,
                  err instanceof Error ? err.stack : String(err),
                ),
              );
          });
        }
      }
    }
  }
}
