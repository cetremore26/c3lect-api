import { Injectable } from '@nestjs/common';
import type {
  OrdersPort,
  PedidoParaPago,
} from '../../application/ports/orders.port';
import {
  EstadoPedido,
  OrderSnapshot,
  OrdersFacade,
} from '../../../orders/public-api';

// Adaptador de salida: traduce el puerto de payments a la API pública de
// orders. Es el único archivo de payments que conoce a orders.
@Injectable()
export class OrdersFacadeAdapter implements OrdersPort {
  constructor(private readonly orders: OrdersFacade) {}

  cotizar(
    items: { productId: string; cantidad: number }[],
    autenticado: boolean,
  ) {
    return this.orders.cotizar(items, autenticado);
  }

  nuevoNumeroDePedido(): string {
    return this.orders.nuevoNumeroDePedido();
  }

  async findForPayment(orderId: string): Promise<PedidoParaPago | null> {
    const order = await this.orders.findForPayment(orderId);
    return order && toPedidoParaPago(order);
  }

  async confirmarPorPago(orderId: string): Promise<void> {
    await this.orders.confirmarPorPago(orderId);
  }

  async cancelarPorPago(orderId: string): Promise<void> {
    await this.orders.cancelarPorPago(orderId);
  }

  async crearConfirmadoPorPago(
    params: Parameters<OrdersPort['crearConfirmadoPorPago']>[0],
  ): Promise<PedidoParaPago> {
    return toPedidoParaPago(await this.orders.crearConfirmadoPorPago(params));
  }
}

function toPedidoParaPago(order: OrderSnapshot): PedidoParaPago {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    pendiente: order.status === EstadoPedido.PENDIENTE,
    total: order.total,
    fbp: order.fbp,
    fbc: order.fbc,
    items: order.items.map((i) => ({
      productId: i.productId,
      nombre: i.nombre,
      precioUnitario: i.precioUnitario,
      cantidad: i.cantidad,
      subtotal: i.subtotal,
    })),
    shippingInfo: order.shippingInfo && {
      email: order.shippingInfo.email,
      nombreCompleto: order.shippingInfo.nombreCompleto,
      telefono: order.shippingInfo.telefono,
      ciudad: order.shippingInfo.ciudad,
      departamento: order.shippingInfo.departamento,
    },
  };
}
