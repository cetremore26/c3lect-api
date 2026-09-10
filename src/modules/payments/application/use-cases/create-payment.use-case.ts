import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoPago, EstadoPedido } from '@prisma/client';
import { ORDER_REPOSITORY } from '../../../orders/application/ports/order-repository.port';
import type { OrderRepositoryPort } from '../../../orders/application/ports/order-repository.port';
import { CreatePaymentDto } from '../../dto/create-payment.dto';
import { PAYMENT_GATEWAY } from '../ports/payment-gateway.port';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type { PaymentRepositoryPort } from '../ports/payment-repository.port';

@Injectable()
export class CreatePaymentUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
  ) {}

  async execute(dto: CreatePaymentDto, userId?: string) {
    const order = await this.orderRepository.findByIdForPayment(dto.orderId);
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    if (order.status !== EstadoPedido.PENDIENTE) {
      throw new BadRequestException(
        `El pedido está en estado ${order.status} y no puede procesarse.',`,
      );
    }

    const result = await this.gateway.createPreference({
      items: order.items.map((item) => ({
        id: item.productId,
        title: item.nombre,
        quantity: item.cantidad,
        unitPrice: item.precioUnitario,
      })),
      payerEmail: order.shippingInfo?.email ?? 'cliente@c3lect.com',
      externalReference: order.orderNumber,
    });

    const payment = await this.payments.create({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: userId ?? null,
      estado: EstadoPago.PENDIENTE,
      preferenceId: result.preferenceId ?? null,
      checkoutUrl: result.checkoutUrl,
      total: order.total,
    });

    return {
      checkoutUrl: result.checkoutUrl,
      preferenceId: result.preferenceId,
      paymentId: payment.id,
    };
  }
}
