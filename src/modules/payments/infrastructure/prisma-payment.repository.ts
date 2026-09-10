import { Injectable } from '@nestjs/common';
import { EstadoPago, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  NewPaymentData,
  PaymentRepositoryPort,
} from '../application/ports/payment-repository.port';

@Injectable()
export class PrismaPaymentRepository implements PaymentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  create(data: NewPaymentData) {
    return this.prisma.payment.create({
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
  }

  findMostRecentByOrderId(orderId: string) {
    return this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findMostRecentByOrderNumber(orderNumber: string) {
    return this.prisma.payment.findFirst({
      where: { orderNumber },
      orderBy: { createdAt: 'desc' },
    });
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
    const { count } = await this.prisma.payment.updateMany({
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
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { orderId },
    });
  }
}
