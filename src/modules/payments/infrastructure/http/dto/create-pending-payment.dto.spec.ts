import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePendingPaymentDto } from './create-pending-payment.dto';

const base = {
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

describe('CreatePendingPaymentDto', () => {
  it('acepta el carrito base', async () => {
    expect(
      await validate(plainToInstance(CreatePendingPaymentDto, base)),
    ).toEqual([]);
  });

  it('acepta 20 items y fbp/fbc de 255', async () => {
    const dto = plainToInstance(CreatePendingPaymentDto, {
      ...base,
      items: Array(20).fill({ productId: 'p', cantidad: 1 }),
      fbp: 'x'.repeat(255),
      fbc: 'x'.repeat(255),
    });
    expect(await validate(dto)).toEqual([]);
  });

  it.each([
    ['21 items', { items: Array(21).fill({ productId: 'p', cantidad: 1 }) }],
    ['fbp de 256', { fbp: 'x'.repeat(256) }],
    ['fbc de 256', { fbc: 'x'.repeat(256) }],
  ])('rechaza %s', async (_, cambio) => {
    expect(
      await validate(
        plainToInstance(CreatePendingPaymentDto, { ...base, ...cambio }),
      ),
    ).not.toEqual([]);
  });
});
