import { NestFactory } from '@nestjs/core';
import { InProcessEventBus } from './shared/infrastructure/events/in-process-event-bus';
import { PrismaService } from './shared/infrastructure/prisma/prisma.service';

// Prueba de humo del composition root: que todo el grafo de módulos resuelva
// (cada puerto con su adaptador, sin ciclos entre contextos) y que los
// suscriptores se registren al arrancar. tsc no detecta un provider faltante;
// esto sí. La conexión de Prisma se anula: no hace falta base de datos.
describe('AppModule (composition root)', () => {
  const envOriginal = { ...process.env };

  beforeAll(() => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret',
      FRONTEND_URL: 'http://localhost:5173',
      MP_ACCESS_TOKEN: 'TEST-token',
      MP_WEBHOOK_SECRET: 'test-webhook-secret',
      API_URL: 'http://localhost:3000',
      RESEND_API_KEY: 're_test',
    });
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  it('resuelve todas las dependencias y registra los suscriptores de eventos', async () => {
    jest.spyOn(PrismaService.prototype, '$connect').mockResolvedValue();
    jest.spyOn(PrismaService.prototype, '$disconnect').mockResolvedValue();

    // Import diferido: ConfigModule.forRoot() valida el entorno al importar
    // app.module, así que debe ocurrir después de asignar las variables. Con
    // un import estático la prueba solo pasaba donde hay un .env local (no en CI).
    const { AppModule } =
      jest.requireActual<typeof import('./app.module')>('./app.module');

    const moduleRef = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
      // Sin esto Nest llama process.exit al fallar y jest no muestra el motivo.
      abortOnError: false,
    });

    const bus = moduleRef.get(InProcessEventBus);
    const suscripciones = (
      bus as unknown as { subscriptions: Map<string, unknown[]> }
    ).subscriptions;

    // Un muestreo de los flujos entre contextos que antes eran imports directos.
    expect(suscripciones.get('orders.pedido-confirmado')).toHaveLength(1); // inventario
    expect(suscripciones.get('inventario.salida-por-pedido')).toHaveLength(1); // ventas
    expect(suscripciones.get('inventario.stock-agotado')).toHaveLength(1); // catálogo
    expect(suscripciones.get('compras.compra-registrada')).toHaveLength(2); // inventario + precios
    expect(suscripciones.get('payments.pago-aprobado')).toHaveLength(2); // notificaciones + meta
    expect(suscripciones.get('auth.usuario-registrado')).toHaveLength(2); // orders + notificaciones

    await moduleRef.close();
  });
});
