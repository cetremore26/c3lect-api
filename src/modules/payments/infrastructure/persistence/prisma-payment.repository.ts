import { Injectable } from '@nestjs/common';
import { EstadoPago, Payment as PaymentRow, Prisma } from '@prisma/client';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import type { DraftPayload } from '../../application/draft-payload';
import {
  NewPaymentData,
  Payment,
  PaymentRepositoryPort,
} from '../../application/ports/payment-repository.port';

// Mapper fila → modelo de aplicación: draftPayload es Json en Postgres.
function toPayment(row: PaymentRow): Payment {
  return {
    ...row,
    draftPayload: row.draftPayload as unknown as DraftPayload | null,
  };
}

@Injectable()
export class PrismaPaymentRepository implements PaymentRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  async create(data: NewPaymentData): Promise<Payment> {
    const row = await this.db.client.payment.create({
      data: {
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        userId: data.userId,
        estado: data.estado,
        preferenceId: data.preferenceId,
        checkoutUrl: data.checkoutUrl,
        total: data.total,
        ...(data.draftPayload != null
          ? {
              draftPayload:
                data.draftPayload as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
    return toPayment(row);
  }

  async findMostRecentByOrderId(orderId: string): Promise<Payment | null> {
    const row = await this.db.client.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    return row && toPayment(row);
  }

  async findMostRecentByOrderNumber(
    orderNumber: string,
  ): Promise<Payment | null> {
    const row = await this.db.client.payment.findFirst({
      where: { orderNumber },
      orderBy: { createdAt: 'desc' },
    });
    return row && toPayment(row);
  }

  async markProcessedIfNotTerminal(params: {
    paymentId: string;
    nuevoEstado: EstadoPago;
    mpPaymentId: string;
  }): Promise<boolean> {
    // Actualización condicional atómica: MercadoPago reintenta la entrega
    // del webhook, así que dos entregas casi simultáneas podrían leer el
    // mismo estado "no terminal" y ambas intentar procesar el pago. Solo
    // la entrega que efectivamente cambia el estado (count===1) continúa;
    // si otra ya lo dejó en estado terminal, count=0 y no hacemos nada más
    // — evita crear dos pedidos para un solo pago.
    const { count } = await this.db.client.payment.updateMany({
      where: {
        id: params.paymentId,
        estado: {
          notIn: [
            EstadoPago.APROBADO,
            EstadoPago.RECHAZADO,
            EstadoPago.CANCELADO,
          ],
        },
      },
      data: { estado: params.nuevoEstado, mpPaymentId: params.mpPaymentId },
    });
    return count > 0;
  }

  async linkToOrder(paymentId: string, orderId: string): Promise<void> {
    await this.db.client.payment.update({
      where: { id: paymentId },
      data: { orderId },
    });
  }
}
