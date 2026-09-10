import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../../audit/audit.service';
import { MailService } from '../../../../mail/mail.service';
import { OrderStatusTransition } from '../../domain/order-status.vo';
import { UpdateOrderStatusDto } from '../../dto/update-order-status.dto';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';

@Injectable()
export class UpdateOrderStatusUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    id: string,
    dto: UpdateOrderStatusDto,
    adminId: string,
    skipStatusEmail = false,
  ) {
    const order = await this.orders.findByIdForStatusTransition(id);
    if (!order) throw new NotFoundException('Pedido no encontrado.');

    OrderStatusTransition.assertValid(order.status, dto.status);

    const updated = await this.orders.transitionStatus({
      orderId: id,
      statusAnterior: order.status,
      statusNuevo: dto.status,
      changedBy: adminId,
      aplicarConfirmacion: OrderStatusTransition.seConfirma(
        order.status,
        dto.status,
      ),
      revertirConfirmacion: OrderStatusTransition.seCancelaConStockDescontado(
        order.status,
        dto.status,
      ),
    });

    const email = updated.shippingInfo?.email;
    const nombre =
      updated.shippingInfo?.nombreCompleto ?? updated.user?.nombre ?? 'Cliente';
    if (email && !skipStatusEmail) {
      void this.mail.sendOrderStatusUpdate(
        email,
        nombre,
        updated.orderNumber,
        dto.status,
      );
    }

    // skipStatusEmail=true solo lo usa el flujo de MercadoPago para la transición
    // PENDIENTE→CONFIRMADO automática — ahí el admin ya recibe el comprobante de
    // pago (sendPaymentConfirmation), así que notificarlo aquí sería duplicado.
    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail && !skipStatusEmail) {
      void this.mail.sendOrderStatusUpdateAdmin(
        adminEmail,
        updated.orderNumber,
        dto.status,
        nombre,
      );
    }

    await this.audit.log(
      'ESTADO',
      'pedido',
      id,
      `Pedido ${updated.orderNumber}: ${order.status} → ${dto.status}`,
      adminId,
    );

    return { message: `Pedido actualizado a ${dto.status}.` };
  }
}
