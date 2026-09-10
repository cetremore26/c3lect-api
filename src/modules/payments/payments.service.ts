import { Injectable } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreatePendingPaymentDto } from './dto/create-pending-payment.dto';
import { WebhookPaymentDto } from './dto/webhook-payment.dto';
import { CreatePaymentUseCase } from './application/use-cases/create-payment.use-case';
import { CreatePendingOrderPaymentUseCase } from './application/use-cases/create-pending-order-payment.use-case';
import { GetPaymentUseCase } from './application/use-cases/get-payment.use-case';
import { HandleWebhookUseCase } from './application/use-cases/handle-webhook.use-case';

// Fachada: mantiene la API pública histórica de PaymentsService (usada por
// PaymentsController) y delega cada método al caso de uso correspondiente.
// La lógica real vive en application/ y domain/ — ver el módulo payments
// para el detalle de capas (mismo patrón que orders/).
@Injectable()
export class PaymentsService {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly createPendingOrderPaymentUseCase: CreatePendingOrderPaymentUseCase,
    private readonly handleWebhookUseCase: HandleWebhookUseCase,
    private readonly getPaymentUseCase: GetPaymentUseCase,
  ) {}

  createPayment(dto: CreatePaymentDto, userId?: string) {
    return this.createPaymentUseCase.execute(dto, userId);
  }

  createPendingOrderPayment(dto: CreatePendingPaymentDto, userId?: string) {
    return this.createPendingOrderPaymentUseCase.execute(dto, userId);
  }

  handleWebhook(
    dto: WebhookPaymentDto,
    xSignature?: string,
    xRequestId?: string,
  ): Promise<void> {
    return this.handleWebhookUseCase.execute(dto, xSignature, xRequestId);
  }

  getByOrderId(orderId: string) {
    return this.getPaymentUseCase.execute(orderId);
  }
}
