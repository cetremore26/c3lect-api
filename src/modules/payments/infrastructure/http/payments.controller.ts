import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CreatePaymentUseCase } from '../../application/use-cases/create-payment.use-case';
import { CreatePendingOrderPaymentUseCase } from '../../application/use-cases/create-pending-order-payment.use-case';
import { GetPaymentUseCase } from '../../application/use-cases/get-payment.use-case';
import { HandleWebhookUseCase } from '../../application/use-cases/handle-webhook.use-case';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreatePendingPaymentDto } from './dto/create-pending-payment.dto';
import { WebhookPaymentDto } from './dto/webhook-payment.dto';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../../shared/infrastructure/http/auth/optional-jwt-auth.guard';
import { CurrentUser } from '../../../../shared/infrastructure/http/auth/current-user.decorator';

@ApiTags('Pagos')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly createPendingOrderPaymentUseCase: CreatePendingOrderPaymentUseCase,
    private readonly handleWebhookUseCase: HandleWebhookUseCase,
    private readonly getPaymentUseCase: GetPaymentUseCase,
  ) {}

  @Post('create')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear preferencia de pago',
    description:
      'Genera una preferencia en MercadoPago y retorna la URL de checkout. Funciona para usuarios autenticados e invitados.',
  })
  @ApiCreatedResponse({
    description: 'Retorna checkoutUrl, preferenceId y paymentId',
  })
  createPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user?: { id: string; rol: string },
  ) {
    return this.createPaymentUseCase.execute(dto, user?.id);
  }

  @Post('create-pending')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear preferencia de pago sin crear el pedido todavía',
    description:
      'Cotiza el carrito y genera una preferencia en MercadoPago. El pedido solo se crea (ya confirmado) cuando el webhook avisa que el pago fue aprobado — así un pago abandonado o rechazado no deja un pedido huérfano.',
  })
  @ApiCreatedResponse({
    description: 'Retorna checkoutUrl, preferenceId y paymentId',
  })
  createPendingOrderPayment(
    @Body() dto: CreatePendingPaymentDto,
    @CurrentUser() user?: { id: string; rol: string },
  ) {
    return this.createPendingOrderPaymentUseCase.execute(dto, user?.id);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({
    summary: 'Webhook de MercadoPago (público)',
    description:
      'Recibe notificaciones de MercadoPago. Retorna 200 inmediatamente y procesa de forma asíncrona.',
  })
  @ApiOkResponse({ description: 'Notificación recibida' })
  handleWebhook(
    @Body() dto: WebhookPaymentDto,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    // Fire-and-forget — MP reintenta si no recibe 200
    void this.handleWebhookUseCase
      .execute(dto, xSignature, xRequestId)
      .catch((err) => this.logger.error('Webhook processing error', err));

    return { received: true };
  }

  @Get(':orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado del pago de un pedido' })
  @ApiOkResponse({
    description: 'Registro de pago más reciente para el pedido',
  })
  @ApiNotFoundResponse({
    description: 'No hay registro de pago para este pedido',
  })
  getPayment(@Param('orderId') orderId: string) {
    return this.getPaymentUseCase.execute(orderId);
  }
}
