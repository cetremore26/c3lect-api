import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type { PaymentRepositoryPort } from '../ports/payment-repository.port';

@Injectable()
export class GetPaymentUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
  ) {}

  async execute(orderId: string) {
    const payment = await this.payments.findMostRecentByOrderId(orderId);
    if (!payment)
      throw new NotFoundException('No hay registro de pago para este pedido.');
    return payment;
  }
}
