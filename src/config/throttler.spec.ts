/* eslint-disable @typescript-eslint/unbound-method */
import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { declaraLimiteAuth, throttlerOptions } from './throttler';
import { PaymentsController } from '../modules/payments/infrastructure/http/payments.controller';

class Rutas {
  @Throttle({ auth: { limit: 8, ttl: 60000 } }) conAuth() {}
  sinAuth() {}
}
const ctx = (h: () => void) =>
  ({
    getHandler: () => h,
    getClass: () => Rutas,
  }) as unknown as ExecutionContext;

const throttlers = (throttlerOptions as { throttlers: any[] }).throttlers;

describe('throttler', () => {
  it('aplica auth solo donde se declara', () => {
    expect(declaraLimiteAuth(ctx(Rutas.prototype.conAuth))).toBe(true);
    expect(declaraLimiteAuth(ctx(Rutas.prototype.sinAuth))).toBe(false);
  });

  it('el throttler auth se omite en rutas sin @Throttle({ auth }) y default es 300', () => {
    const auth = throttlers.find((t) => t.name === 'auth');
    const def = throttlers.find((t) => t.name === 'default');
    expect(auth.limit).toBe(8);
    expect(auth.skipIf(ctx(Rutas.prototype.sinAuth))).toBe(true);
    expect(auth.skipIf(ctx(Rutas.prototype.conAuth))).toBe(false);
    expect(def.limit).toBe(300);
  });

  it('el webhook de MercadoPago omite default y auth', () => {
    const h = PaymentsController.prototype.handleWebhook;
    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', h)).toBe(true);
    expect(Reflect.getMetadata('THROTTLER:SKIPauth', h)).toBe(true);
  });
});
