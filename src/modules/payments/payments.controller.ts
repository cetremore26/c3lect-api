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
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { WebhookPaymentDto } from './dto/webhook-payment.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Pagos')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

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
    return this.paymentsService.createPayment(dto, user?.id);
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
    void this.paymentsService
      .handleWebhook(dto, xSignature, xRequestId)
      .catch((err) => this.logger.error('Webhook processing error', err));

    return { received: true };
  }

  @Get(':orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado del pago de un pedido' })
  @ApiOkResponse({ description: 'Registro de pago más reciente para el pedido' })
  @ApiNotFoundResponse({ description: 'No hay registro de pago para este pedido' })
  getPayment(@Param('orderId') orderId: string) {
    return this.paymentsService.getByOrderId(orderId);
  }
}
