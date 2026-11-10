import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

const base = {
  metodoPago: 'NEQUI',
  items: [{ productId: 'p', cantidad: 1 }],
  shippingInfo: {
    nombreCompleto: 'Ana Pérez',
    email: 'ana@example.com',
    telefono: '3001234567',
    ciudad: 'Bogotá',
    departamento: 'Cundinamarca',
    direccion: 'Calle 1 # 2-3',
  },
};

describe('CreateOrderDto', () => {
  it('acepta el pedido base con NEQUI', async () => {
    expect(await validate(plainToInstance(CreateOrderDto, base))).toEqual([]);
  });

  it.each([
    ['21 items', { items: Array(21).fill({ productId: 'p', cantidad: 1 }) }],
    ['cantidad 11', { items: [{ productId: 'p', cantidad: 11 }] }],
    ['fbp de 256', { fbp: 'x'.repeat(256) }],
    ['fbc de 256', { fbc: 'x'.repeat(256) }],
    ['MERCADOPAGO', { metodoPago: 'MERCADOPAGO' }],
    ['TARJETA_CREDITO', { metodoPago: 'TARJETA_CREDITO' }],
  ])('rechaza %s', async (_, cambio) => {
    expect(
      await validate(plainToInstance(CreateOrderDto, { ...base, ...cambio })),
    ).not.toEqual([]);
  });
});
