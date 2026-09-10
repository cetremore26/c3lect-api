import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../../../mail/mail.service';
import { MetaConversionsService } from '../../../meta-conversions/meta-conversions.service';
import { buildOrderNumber } from '../../domain/order-number';
import { CreateOrderDto } from '../../dto/create-order.dto';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';
import { ResolveOrderItemsUseCase } from './resolve-order-items.use-case';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    private readonly resolveOrderItems: ResolveOrderItemsUseCase,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly metaConversions: MetaConversionsService,
  ) {}

  async execute(dto: CreateOrderDto, userId?: string) {
    const { itemsData, subtotal, total } = await this.resolveOrderItems.execute(
      dto.items,
      !!userId,
    );
    const orderNumber = buildOrderNumber();

    const order = await this.orders.create({
      orderNumber,
      userId: userId ?? null,
      subtotal,
      total,
      paymentMethod: dto.metodoPago,
      fbp: dto.fbp ?? null,
      fbc: dto.fbc ?? null,
      items: itemsData,
      shippingInfo: dto.shippingInfo,
    });

    const nombreCliente = dto.shippingInfo.nombreCompleto;

    void this.mail.sendOrderConfirmation(
      dto.shippingInfo.email,
      nombreCliente,
      order.orderNumber,
      order.items,
      order.total,
    );

    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail) {
      void this.mail.sendNewOrderAdmin(
        adminEmail,
        order.orderNumber,
        nombreCliente,
        order.total,
        order.items,
      );
    }

    // Purchase por Conversions API para los pedidos que NO pasan por
    // MercadoPago (contraentrega y transferencia). Estos nunca llegan al
    // webhook de payments, así que sin este envío Meta no se entera de ellos.
    // Va con `void` como los correos: el pedido no debe esperar a Meta.
    void this.metaConversions.sendPurchase({
      orderNumber: order.orderNumber,
      total: order.total,
      contentIds: order.items.map((i) => i.productId),
      user: {
        email: dto.shippingInfo.email,
        phone: dto.shippingInfo.telefono,
        firstName: nombreCliente.trim().split(' ')[0],
        lastName: nombreCliente.trim().split(' ').slice(1).join(' '),
        city: dto.shippingInfo.ciudad,
        state: dto.shippingInfo.departamento,
        fbp: order.fbp,
        fbc: order.fbc,
      },
    });

    return order;
  }
}
