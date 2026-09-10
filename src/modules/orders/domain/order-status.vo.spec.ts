import { BadRequestException } from '@nestjs/common';
import { EstadoPedido } from '@prisma/client';
import { OrderStatusTransition } from './order-status.vo';

describe('OrderStatusTransition', () => {
  const casosInvalidos: [EstadoPedido, EstadoPedido][] = [
    [EstadoPedido.PENDIENTE, EstadoPedido.EN_CAMINO],
    [EstadoPedido.PENDIENTE, EstadoPedido.ENTREGADO],
    [EstadoPedido.CONFIRMADO, EstadoPedido.PENDIENTE],
    [EstadoPedido.CONFIRMADO, EstadoPedido.ENTREGADO],
    [EstadoPedido.EN_CAMINO, EstadoPedido.PENDIENTE],
    [EstadoPedido.EN_CAMINO, EstadoPedido.CONFIRMADO],
    [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
    [EstadoPedido.ENTREGADO, EstadoPedido.CONFIRMADO],
    [EstadoPedido.CANCELADO, EstadoPedido.CONFIRMADO],
    [EstadoPedido.CANCELADO, EstadoPedido.PENDIENTE],
  ];

  it.each(casosInvalidos)('rechaza la transicion %s -> %s', (desde, hacia) => {
    expect(() => OrderStatusTransition.assertValid(desde, hacia)).toThrow(
      BadRequestException,
    );
  });

  const casosValidos: [EstadoPedido, EstadoPedido][] = [
    [EstadoPedido.PENDIENTE, EstadoPedido.CONFIRMADO],
    [EstadoPedido.PENDIENTE, EstadoPedido.CANCELADO],
    [EstadoPedido.CONFIRMADO, EstadoPedido.EN_CAMINO],
    [EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO],
    [EstadoPedido.EN_CAMINO, EstadoPedido.ENTREGADO],
    [EstadoPedido.EN_CAMINO, EstadoPedido.CANCELADO],
  ];

  it.each(casosValidos)('acepta la transicion %s -> %s', (desde, hacia) => {
    expect(() => OrderStatusTransition.assertValid(desde, hacia)).not.toThrow();
  });

  describe('seConfirma', () => {
    it('es true solo para PENDIENTE -> CONFIRMADO', () => {
      expect(
        OrderStatusTransition.seConfirma(
          EstadoPedido.PENDIENTE,
          EstadoPedido.CONFIRMADO,
        ),
      ).toBe(true);
      expect(
        OrderStatusTransition.seConfirma(
          EstadoPedido.CONFIRMADO,
          EstadoPedido.EN_CAMINO,
        ),
      ).toBe(false);
    });
  });

  describe('seCancelaConStockDescontado', () => {
    it('es true al cancelar un pedido que ya paso por CONFIRMADO', () => {
      expect(
        OrderStatusTransition.seCancelaConStockDescontado(
          EstadoPedido.CONFIRMADO,
          EstadoPedido.CANCELADO,
        ),
      ).toBe(true);
      expect(
        OrderStatusTransition.seCancelaConStockDescontado(
          EstadoPedido.EN_CAMINO,
          EstadoPedido.CANCELADO,
        ),
      ).toBe(true);
    });

    it('es false al cancelar desde PENDIENTE (nunca se desconto stock)', () => {
      expect(
        OrderStatusTransition.seCancelaConStockDescontado(
          EstadoPedido.PENDIENTE,
          EstadoPedido.CANCELADO,
        ),
      ).toBe(false);
    });
  });
});
