# Fase 3 — Pedidos, stock y ventas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el stock y las ventas cuadren siempre: transiciones de pedido atómicas, reversión de lo realmente despachado, ventas de pedido protegidas, ganancia entera, fechas de negocio en Bogotá, productos ocultos que no se re-publican solos, catálogo público filtrado y pedidos idempotentes.

**Architecture:** Todo en `c3lect-api` (monolito modular, Clean Architecture, eventos + UoW; ver `ARCHITECTURE.md`). La reversión de un pedido pasa a ser el espejo de la confirmación: `orders → ConfirmacionDePedidoRevertida → ventas (lee y borra sus filas) → VentasDePedidoAnuladas → inventario repone`. `ocultoPorAdmin` lo deduce la API sola (el panel solo puede cambiar `disponible` por `PATCH /products/:id`, siempre a mano), así que **no hay tareas de front**.

**Tech Stack:** NestJS 11, Prisma 6 + `@prisma/adapter-pg`, PostgreSQL, Jest 30 (`pnpm test`, `pnpm test:int`), class-validator. Zona horaria con `Intl.DateTimeFormat` nativo (sin dependencia nueva).

**Spec:** `docs/superpowers/specs/2026-11-10-correcciones-revision-design.md` (sección "Fase 3 — Pedidos, stock y ventas").

## Global Constraints

- Repo: `d:\C3LECT\BOVEDA\c3lect-api`, rama `fix/correcciones-revision`. Gestor: pnpm. **Ninguna dependencia nueva.**
- Las fases 0–2 ya están aplicadas: Fase 1 normaliza emails y limita `POST /orders` (5 por email/hora); Fase 2 agrupa stock por modelo en la verificación previa. No repetir ese trabajo.
- Regla de dependencias de `ARCHITECTURE.md` (la verifica `src/architecture.spec.ts`): `domain` sin Nest/Prisma; `application` sin otros módulos; cruce entre módulos solo por `public-api.ts` o eventos.
- Errores de negocio: `ConflictError` (409) y `BusinessRuleViolation` (400) de `src/shared/domain/domain-error.ts`.
- Zona de negocio `America/Bogota`, offset fijo `-05:00` (Colombia no tiene horario de verano).
- `idempotencyKey`: UUID, columna única `orders.idempotency_key`. Flag de producto: `ocultoPorAdmin` → columna `productos.oculto_por_admin`.
- Commits: conventional commits en español, **sin** `Co-Authored-By` ni menciones a Claude.
- Gate al final de cada tarea: `pnpm exec tsc --noEmit` y `pnpm test` en verde.
- Int-specs: `INTEGRATION_DATABASE_URL=postgresql://c3lect:c3lect@localhost:5433/c3lect_dev pnpm test:int`. NUNCA apuntarla a producción. Antes, aplicar migraciones a esa base: `DATABASE_URL=$INTEGRATION_DATABASE_URL pnpm exec prisma migrate deploy`.

## Review Focus

1. **Cancelar un pedido CONFIRMADO cuyas líneas no estaban en inventario** (sin filas en `historical_sales`): la cancelación debe completar sin reponer nada ni fallar. → Task 4, test `anular sin ventas no publica nada`.
2. **Guardar el formulario de un producto agotado sin tocar el interruptor** (`AdminProductoForm` reenvía siempre `disponible: false`): no debe marcarlo oculto, o nunca volvería a publicarse al reponer stock. → Task 7, test `no cambia ocultoPorAdmin si disponible no cambia`.
3. **Editar una venta manual reenviando el formulario completo** (misma marca/modelo, `marca: ''` cuando la guardada es `null`, distinto uso de mayúsculas): no debe rechazarse. → Task 6, test `acepta marca/modelo iguales ignorando mayúsculas, espacios y null vs ''`.
4. **Doble clic / reintento concurrente de `POST /orders` con la misma clave**: un solo pedido y un solo `PedidoCreado`. → Task 9, int-spec `creaciones concurrentes con la misma clave` y unit `no publica PedidoCreado si el repositorio devuelve nuevo=false`.
5. **Venta con margen negativo y abono parcial**: la ganancia redondeada no debe quedar en `-0` (Jest y los totales la tratarían distinto de `0`). → Task 2, test `normaliza -0 a 0`.

---

### Task 1: Día de negocio en Bogotá

**Files:**
- Create: `src/shared/domain/fecha-negocio.ts`
- Create: `src/shared/domain/fecha-negocio.spec.ts`
- Modify: `src/modules/orders/domain/order-number.ts`, `src/modules/orders/domain/order-number.spec.ts`
- Modify: `src/modules/orders/application/use-cases/list-orders.use-case.ts`
- Create: `src/modules/orders/application/use-cases/list-orders.use-case.spec.ts`
- Modify: `src/modules/orders/infrastructure/http/dto/query-orders.dto.ts`
- Modify: `src/modules/ventas/application/ventas-de-pedido.service.ts`, `ventas-de-pedido.service.spec.ts`

**Interfaces:**
- Produces (en `src/shared/domain/fecha-negocio.ts`):
  - `export const ZONA_NEGOCIO = 'America/Bogota'`
  - `diaDeNegocio(instante: Date = new Date()): string` → `'YYYY-MM-DD'` en Bogotá. Implementar con `new Intl.DateTimeFormat('en-US', { timeZone: ZONA_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante)` y armar con las partes `year`, `month`, `day` (no depender del orden de un locale).
  - `inicioDelDiaDeNegocio(dia: string): Date` → `new Date(\`${dia}T00:00:00.000-05:00\`)`
  - `finDelDiaDeNegocio(dia: string): Date` → `new Date(\`${dia}T23:59:59.999-05:00\`)`
  - `diaDeNegocioComoFecha(instante: Date = new Date()): Date` → `new Date(\`${diaDeNegocio(instante)}T00:00:00.000Z\`)` (misma convención que las ventas manuales, que guardan `new Date('YYYY-MM-DD')` en la columna `@db.Date`).
- Produces: `buildOrderNumber(ahora: Date = new Date()): string` (misma firma pública; el parámetro es para tests).

- [ ] **Step 1: Write the failing tests**

`fecha-negocio.spec.ts`:
```ts
it('a las 22:30 de Bogotá sigue siendo el mismo día', () => {
  expect(diaDeNegocio(new Date('2026-11-11T03:30:00Z'))).toBe('2026-11-10');
});
it('a medianoche de Bogotá cambia el día', () => {
  expect(diaDeNegocio(new Date('2026-11-11T05:00:00Z'))).toBe('2026-11-11');
});
it('rango del día con offset -05:00', () => {
  expect(inicioDelDiaDeNegocio('2026-11-10').toISOString()).toBe('2026-11-10T05:00:00.000Z');
  expect(finDelDiaDeNegocio('2026-11-10').toISOString()).toBe('2026-11-11T04:59:59.999Z');
});
it('diaDeNegocioComoFecha devuelve la medianoche UTC del día de Bogotá', () => {
  expect(diaDeNegocioComoFecha(new Date('2026-11-11T03:30:00Z')).toISOString()).toBe('2026-11-10T00:00:00.000Z');
});
```
`order-number.spec.ts`: añadir
```ts
it('usa el día de Bogotá, no el del servidor UTC', () => {
  expect(buildOrderNumber(new Date('2026-11-11T03:30:00Z'))).toMatch(/^C3L-20261110-[A-Z0-9]{5}$/);
});
```
`list-orders.use-case.spec.ts` (repo fake con `findMany: jest.fn().mockResolvedValue({ data: [], total: 0 })`):
```ts
it('interpreta fechaDesde/fechaHasta como días de Bogotá', async () => {
  await useCase.execute({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-10' }, { userId: 'a', rol: 'ADMIN' });
  const [filtro] = orders.findMany.mock.calls[0];
  expect(filtro.fechaDesde.toISOString()).toBe('2026-11-01T05:00:00.000Z');
  expect(filtro.fechaHasta.toISOString()).toBe('2026-11-11T04:59:59.999Z');
});
```
`ventas-de-pedido.service.spec.ts`: con `jest.useFakeTimers().setSystemTime(new Date('2026-11-11T03:30:00Z'))`, `registrar(...)` produce filas con `fecha.toISOString() === '2026-11-10T00:00:00.000Z'` (restaurar con `jest.useRealTimers()` en `afterEach`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- fecha-negocio order-number list-orders ventas-de-pedido`
Expected: FAIL (`Cannot find module './fecha-negocio'`, y fechas/sufijo en UTC).

- [ ] **Step 3: Implement**

- `fecha-negocio.ts` con las cuatro funciones de Interfaces.
- `buildOrderNumber(ahora = new Date())`: `C3L-${diaDeNegocio(ahora).replaceAll('-', '')}-${randomSuffix(5)}`.
- `ListOrdersUseCase`: `fechaDesde ? inicioDelDiaDeNegocio(fechaDesde) : undefined`, `fechaHasta ? finDelDiaDeNegocio(fechaHasta) : undefined`.
- `QueryOrdersDto`: en `fechaDesde` y `fechaHasta` sustituir `@IsDateString()` por `@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Usa el formato YYYY-MM-DD' })` (el panel ya manda el valor de un `<input type="date">`).
- `VentasDePedidoService.registrar`: `const fecha = diaDeNegocioComoFecha();`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- fecha-negocio order-number list-orders ventas-de-pedido` → PASS. Luego `pnpm exec tsc --noEmit` y `pnpm test` → PASS (incluye `architecture.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/fecha-negocio.ts src/shared/domain/fecha-negocio.spec.ts src/modules/orders src/modules/ventas/application/ventas-de-pedido.service.ts src/modules/ventas/application/ventas-de-pedido.service.spec.ts
git commit -m "fix(pedidos): calcular el día de negocio en hora de Bogotá"
```

---

### Task 2: Ganancia neta entera

**Files:**
- Modify: `src/modules/ventas/domain/ganancia.ts`
- Test: `src/modules/ventas/domain/ganancia.spec.ts`

**Interfaces:**
- Produces: `calcGananciaPorVenta(...)` misma firma; ahora devuelve siempre un entero (lo consumen `ventas.service`, `ventas-de-pedido.service`, `ventas.util` y `metrics.queries`).

- [ ] **Step 1: Write the failing tests**

```ts
it('redondea al peso con abono no proporcional', () => {
  // margen 50000; abono 70000/150000 → 23333.33…
  expect(calcGananciaPorVenta('Abonado', 150000, 100000, 0, 70000)).toBe(23333);
});
it('normaliza -0 a 0', () => {
  // margen -100; abono 1/300 → -0.33 → Math.round = -0
  expect(calcGananciaPorVenta('Abonado', 300, 400, 0, 1)).toBe(0);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test -- ganancia.spec` → FAIL (`23333.333…`, `-0`).

- [ ] **Step 3: Implement**

Envolver ambos retornos: `Math.round(valor) || 0` (el `|| 0` convierte `-0` en `0`). Actualizar el comentario de cabecera ("redondeada al peso").

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- ganancia ventas metrics` → PASS; `pnpm exec tsc --noEmit` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ventas/domain/ganancia.ts src/modules/ventas/domain/ganancia.spec.ts
git commit -m "fix(ventas): redondear la ganancia neta a un entero"
```

---

### Task 3: Transiciones de estado atómicas

**Files:**
- Modify: `src/modules/orders/application/ports/order-repository.port.ts:131-137`
- Modify: `src/modules/orders/infrastructure/persistence/prisma-order.repository.ts:158-179`
- Modify: `src/modules/orders/application/use-cases/update-order-status.use-case.ts`
- Test: `src/modules/orders/application/use-cases/update-order-status.use-case.spec.ts`
- Create: `src/modules/orders/infrastructure/persistence/prisma-order.repository.int-spec.ts`

**Interfaces:**
- Produces (puerto): `transitionStatus(params: { orderId: string; statusAnterior: EstadoPedido; statusNuevo: EstadoPedido; changedBy: string }): Promise<OrderForStatusTransition | null>` — `null` si el pedido ya no estaba en `statusAnterior`.
- Produces: en el caso de uso, `ConflictError('El pedido cambió de estado mientras se procesaba. Recarga e inténtalo de nuevo.')`.
- Produces (int-spec, reutilizado en Task 9): helper local `nuevoPedido(overrides?: Partial<NewOrderData>): NewOrderData` con `orderNumber: \`C3L-TEST-${randomUUID().slice(0, 8)}\``, un item y `shippingInfo` de prueba.

- [ ] **Step 1: Write the failing unit tests**

En `update-order-status.use-case.spec.ts`:
```ts
it('lee el pedido dentro de la transaccion', async () => {
  const { useCase, uow, orders } = makeUseCase(makeOrder(EstadoPedido.PENDIENTE));
  uow.run.mockImplementation(async (work) => {
    expect(orders.findByIdForStatusTransition).not.toHaveBeenCalled();
    return work();
  });
  await useCase.execute('order-1', EstadoPedido.CONFIRMADO, 'admin-1');
  expect(orders.findByIdForStatusTransition).toHaveBeenCalledTimes(1);
});

it('si otro proceso cambió el estado antes, lanza ConflictError sin publicar', async () => {
  const { useCase, orders, events, audit } = makeUseCase(makeOrder(EstadoPedido.PENDIENTE));
  orders.transitionStatus.mockResolvedValue(null);
  await expect(useCase.execute('order-1', EstadoPedido.CONFIRMADO, 'admin-1')).rejects.toThrow(ConflictError);
  expect(events.publish).not.toHaveBeenCalled();
  expect(audit.log).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write the failing int-spec**

`prisma-order.repository.int-spec.ts`, mismo patrón de salto que `catalogo-publico.int-spec.ts` (`describeDb = url ? describe : describe.skip`). En `beforeAll`: `process.env.DATABASE_URL = url; prisma = new PrismaService(); await prisma.$connect(); host = new PrismaTransactionHost(prisma); repo = new PrismaOrderRepository(host);`. Sin transacción envolvente (la concurrencia necesita commits reales); `afterAll`: `prisma.order.deleteMany({ where: { orderNumber: { startsWith: 'C3L-TEST-' } } })` (cascada) y `$disconnect()`.

```ts
it('dos transiciones concurrentes desde PENDIENTE: solo una aplica', async () => {
  const order = await repo.create(nuevoPedido()); // Task 9 lo cambia a `const { order } = …`
  const transicion = (statusNuevo: EstadoPedido) =>
    host.run(() => repo.transitionStatus({ orderId: order.id, statusAnterior: EstadoPedido.PENDIENTE, statusNuevo, changedBy: 'int-spec' }));
  const resultados = await Promise.all([transicion(EstadoPedido.CONFIRMADO), transicion(EstadoPedido.CANCELADO)]);
  expect(resultados.filter((r) => r === null)).toHaveLength(1);
  const ganador = resultados.find((r) => r !== null)!;
  const enBase = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(enBase.status).toBe(ganador.status);
  expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, statusAnterior: EstadoPedido.PENDIENTE } })).toBe(1);
});

it('con estado anterior desactualizado devuelve null y no escribe historial', async () => {
  const pedido = await repo.create(nuevoPedido());
  const r = await host.run(() => repo.transitionStatus({ orderId: pedido.id, statusAnterior: EstadoPedido.CONFIRMADO, statusNuevo: EstadoPedido.EN_CAMINO, changedBy: 'int-spec' }));
  expect(r).toBeNull();
  expect(await prisma.orderStatusHistory.count({ where: { orderId: pedido.id } })).toBe(1); // solo la de creación
});
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm test -- update-order-status` → FAIL (lectura fuera de la transacción; no hay `ConflictError`).
Run: `INTEGRATION_DATABASE_URL=… pnpm test:int -- prisma-order.repository` → FAIL (ambas transiciones aplican: dos filas de historial con `statusAnterior = PENDIENTE`).

- [ ] **Step 4: Implement**

- Repositorio: `const { count } = await client.order.updateMany({ where: { id: orderId, status: statusAnterior }, data: { status: statusNuevo } }); if (count === 0) return null;` y después historial + `findUniqueOrThrow` como hoy.
- Caso de uso: mover `findByIdForStatusTransition`, el `NotFoundError` y `OrderStatusTransition.assertValid` **dentro** de `uow.run`; si `transitionStatus` devuelve `null` lanzar el `ConflictError` de Interfaces. `uow.run` devuelve el `order` leído para el `audit.log` posterior.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test -- update-order-status` → PASS (los 8 tests previos siguen en verde).
Run: `INTEGRATION_DATABASE_URL=… pnpm test:int -- prisma-order.repository` → PASS.
Run: `pnpm exec tsc --noEmit` → sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/modules/orders
git commit -m "fix(pedidos): transición de estado condicional para evitar carreras"
```

---

### Task 4: La cancelación repone lo realmente despachado

**Files:**
- Modify: `src/modules/ventas/domain/venta-events.ts`, `src/modules/ventas/domain/ventas.util.ts`, `ventas.util.spec.ts`
- Modify: `src/modules/ventas/application/ports/ventas-repository.port.ts`, `src/modules/ventas/infrastructure/persistence/ventas.repository.ts`
- Modify: `src/modules/ventas/application/ventas-de-pedido.service.ts`, `ventas-de-pedido.service.spec.ts`
- Modify: `src/modules/ventas/public-api.ts`
- Modify: `src/modules/inventario/application/movimientos.service.ts`, `movimientos.service.spec.ts`
- Modify: `src/modules/inventario/infrastructure/events/inventario-event.subscribers.ts`
- Modify: `src/modules/orders/domain/order-events.ts:75-87`, `src/modules/orders/application/use-cases/update-order-status.use-case.ts`, su spec
- Modify: `ARCHITECTURE.md` (tabla de bounded contexts, filas Inventario y Ventas)

**Interfaces:**
- Produces (ventas, dominio):
  ```ts
  export class VentasDePedidoAnuladas implements DomainEvent {
    static readonly NAME = 'ventas.ventas-de-pedido-anuladas';
    constructor(readonly anulacion: { orderId: string; lineas: { marca: string | null; modelo: string; cantidad: number }[] }) {}
  }
  ```
  exportado en `ventas/public-api.ts`.
- Produces: `agruparUnidadesPorModelo(ventas: { marca: string | null; modelo: string }[]): { marca: string | null; modelo: string; cantidad: number }[]` en `ventas.util.ts` (clave exacta `marca ?? ''` + `modelo`, conserva el orden de primera aparición).
- Produces (puerto ventas): `findByOrderId(orderId: string): Promise<Venta[]>`.
- Produces: constructor `VentasDePedidoService(ventasRepository, @Inject(EVENT_BUS) events: EventBusPort)`.
- Produces (inventario): `MovimientosService.revertirSalidaPorPedido(lineas: (ModeloRef & { cantidad: number })[]): Promise<void>` y el helper privado `reponer(ref: ModeloRef, cantidad: number, nombreLegado: string): Promise<void>` (busca con `buscarPorModelo(ref.modelo, nombreLegado)`, sale si no hay fila, `incrementar(item.id, cantidad)`, publica `StockRepuesto({ ...ref, nombreProducto: null })` si el stock resultante es > 0). Task 5 lo reutiliza.
- Produces (orders): `ConfirmacionDePedidoRevertida` pasa a `{ orderId: string; orderNumber: string }` (sin `lineas`).

- [ ] **Step 1: Write the failing tests**

`ventas.util.spec.ts`:
```ts
it('agrupa unidades por marca y modelo', () => {
  expect(agruparUnidadesPorModelo([
    { marca: 'Rolex', modelo: 'Submariner' }, { marca: 'Rolex', modelo: 'Submariner' }, { marca: null, modelo: 'Organizador' },
  ])).toEqual([
    { marca: 'Rolex', modelo: 'Submariner', cantidad: 2 }, { marca: null, modelo: 'Organizador', cantidad: 1 },
  ]);
});
```
`ventas-de-pedido.service.spec.ts` (repo fake con `findByOrderId`, `removeByOrderId`, `createMany`; `events = fakeEventBus()`):
```ts
it('anular borra las ventas del pedido y publica lo despachado agrupado', async () => {
  repo.findByOrderId.mockResolvedValue([{ marca: 'Rolex', modelo: 'Submariner' }, { marca: 'Rolex', modelo: 'Submariner' }]);
  await service.anular('order-1');
  expect(repo.removeByOrderId).toHaveBeenCalledWith('order-1');
  expect(events.of(VentasDePedidoAnuladas)[0].anulacion).toEqual({ orderId: 'order-1', lineas: [{ marca: 'Rolex', modelo: 'Submariner', cantidad: 2 }] });
});
it('anular sin ventas no publica nada', async () => {
  repo.findByOrderId.mockResolvedValue([]);
  await service.anular('order-1');
  expect(events.publish).not.toHaveBeenCalled();
});
```
`movimientos.service.spec.ts` (reemplaza los tests actuales de `revertirSalidaPorPedido`):
```ts
it('revertirSalidaPorPedido repone por modelo con fallback "Marca Modelo" e incremento por id', async () => {
  const { service, repo, events } = makeService();
  await service.revertirSalidaPorPedido([{ marca: 'Rolex', modelo: 'Submariner', cantidad: 2 }]);
  expect(repo.buscarPorModelo).toHaveBeenCalledWith('Submariner', 'Rolex Submariner');
  expect(repo.incrementar).toHaveBeenCalledWith('inv-1', 2);
  expect(events.of(StockRepuesto)[0].ref).toEqual({ marca: 'Rolex', modelo: 'Submariner', nombreProducto: null });
});
```
`update-order-status.use-case.spec.ts`: el test de cancelación de CONFIRMADO afirma `events.of(ConfirmacionDePedidoRevertida)[0].pedido` `toEqual({ orderId: 'order-1', orderNumber: 'C3L-20260101-ABCDE' })` y `catalog.findByIds` no llamado.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test -- ventas.util ventas-de-pedido movimientos update-order-status` → FAIL.

- [ ] **Step 3: Implement**

- Ventas: evento, `agruparUnidadesPorModelo`, `findByOrderId` (`historicalSale.findMany({ where: { orderId } })`), y `anular(orderId)`: leer → si vacío, `return` → `removeByOrderId` → publicar `VentasDePedidoAnuladas` con las líneas agrupadas.
- Inventario: `revertirSalidaPorPedido` llama a `reponer(linea, linea.cantidad, combineMarcaModelo(linea.marca, linea.modelo))` por línea. En `InventarioEventSubscribers` sustituir la suscripción a `ConfirmacionDePedidoRevertida` por `VentasDePedidoAnuladas` (`in-transaction`, `({ anulacion }) => this.movimientos.revertirSalidaPorPedido(anulacion.lineas)`); quitar el import de `ConfirmacionDePedidoRevertida`.
- Orders: quitar `lineas` del evento y dejar de llamar a `toLineasInventariables` en la rama de cancelación.
- `ARCHITECTURE.md`: Ventas publica también `VentasDePedidoAnuladas`; Inventario escucha `VentasDePedidoAnuladas` en lugar de `ConfirmacionDePedidoRevertida`. Añadir debajo del diagrama de "confirmar un pedido" el inverso en una línea: `cancelar CONFIRMADO → ConfirmacionDePedidoRevertida [in-tx] → ventas borra sus filas → VentasDePedidoAnuladas [in-tx] → inventario repone`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test` → PASS (incluye `architecture.spec.ts`); `pnpm exec tsc --noEmit` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ventas src/modules/inventario src/modules/orders ARCHITECTURE.md
git commit -m "fix(inventario): reponer stock según las ventas registradas del pedido"
```

---

### Task 5: Revertir venta manual por búsqueda insensible e id

**Files:**
- Modify: `src/modules/inventario/application/movimientos.service.ts:129-138`
- Test: `src/modules/inventario/application/movimientos.service.spec.ts`

**Interfaces:**
- Consumes: `reponer(ref, cantidad, nombreLegado)` de Task 4.

- [ ] **Step 1: Write the failing test**

```ts
it('revertirVentaManual busca sin distinguir mayúsculas e incrementa por id', async () => {
  const { service, repo, events } = makeService();
  await service.revertirVentaManual({ marca: 'Rolex', modelo: 'submariner' });
  expect(repo.buscarPorModelo).toHaveBeenCalledWith('submariner', 'submariner');
  expect(repo.incrementar).toHaveBeenCalledWith('inv-1', 1);
  expect(repo.ajustarStockPorModelo).not.toHaveBeenCalled();
  expect(events.of(StockRepuesto)).toHaveLength(1);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test -- movimientos` → FAIL (usa `ajustarStockPorModelo`).

- [ ] **Step 3: Implement**

`revertirVentaManual(ref)` = `this.reponer(ref, 1, ref.modelo)` (mismo segundo argumento que `salidaPorVentaManual`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- movimientos` → PASS; `pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/inventario/application/movimientos.service.ts src/modules/inventario/application/movimientos.service.spec.ts
git commit -m "fix(inventario): revertir venta manual con la misma búsqueda que la salida"
```

---

### Task 6: Ventas de pedido no borrables y marca/modelo no editables

**Files:**
- Modify: `src/modules/ventas/application/ventas.service.ts:121-150`
- Modify: `src/modules/ventas/domain/ventas.util.ts` (`planVentaUpdate`)
- Test: `src/modules/ventas/application/ventas.service.spec.ts`, `src/modules/ventas/domain/ventas.util.spec.ts`

**Interfaces:**
- Produces: `planVentaUpdate(existing, dto)` lanza `BusinessRuleViolation('No se puede cambiar la marca ni el modelo de una venta: bórrala y créala de nuevo.')` si cambian; el plan devuelto siempre lleva `marca`/`modelo` de `existing`.
- Produces: `VentasService.remove` lanza `BusinessRuleViolation('Esta venta viene de un pedido de la plataforma: cancela el pedido en su lugar.')` si `existing.orderId` no es null.

- [ ] **Step 1: Write the failing tests**

`ventas.util.spec.ts` (con el `existente` del describe):
```ts
it('rechaza cambiar el modelo', () => {
  expect(() => planVentaUpdate(existente, { modelo: 'Daytona' })).toThrow(BusinessRuleViolation);
});
it('rechaza cambiar la marca', () => {
  expect(() => planVentaUpdate(existente, { marca: 'Omega' })).toThrow(BusinessRuleViolation);
});
it('acepta marca/modelo iguales ignorando mayúsculas, espacios y null vs ""', () => {
  expect(planVentaUpdate(existente, { marca: ' rolex ', modelo: 'SUBMARINER', abono: 500 })).toMatchObject({ marca: 'Rolex', modelo: 'Submariner', abono: 500 });
  expect(() => planVentaUpdate({ ...existente, marca: null }, { marca: '' })).not.toThrow();
});
```
`ventas.service.spec.ts`:
```ts
it('no borra una venta que viene de un pedido', async () => {
  repository.findById.mockResolvedValue({ id: 'v1', orderId: 'order-1', marca: 'Rolex', modelo: 'Submariner', cliente: 'Ana' });
  await expect(service.remove('v1')).rejects.toThrow(BusinessRuleViolation);
  expect(repository.remove).not.toHaveBeenCalled();
  expect(events.publish).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test -- ventas` → FAIL.

- [ ] **Step 3: Implement**

- `ventas.util.ts`: comparar `(dto.marca ?? existing.marca ?? '').trim().toLowerCase()` contra `(existing.marca ?? '').trim().toLowerCase()`, y lo mismo para `modelo`; si difieren, lanzar. En el plan: `marca: existing.marca`, `modelo: existing.modelo`.
- `ventas.service.ts`: la comprobación de `orderId` justo tras `findExisting`; borrar el bloque `TODO`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- ventas` → PASS; `pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ventas
git commit -m "fix(ventas): bloquear borrar ventas de pedidos y cambiar su marca o modelo"
```

---

### Task 7: `ocultoPorAdmin`

**Files:**
- Modify: `prisma/schema.prisma` (model `Product`)
- Create: `prisma/migrations/20261110150000_productos_oculto_por_admin/migration.sql`
- Modify: `src/modules/products/domain/product.ts`
- Create: `src/modules/products/domain/product.spec.ts`
- Modify: `src/modules/products/application/ports/products-repository.port.ts`, `src/modules/products/infrastructure/persistence/products.repository.ts`, `products.repository.spec.ts`
- Modify: `src/modules/products/application/products.service.ts`, `products.service.spec.ts`
- Modify: `src/modules/products/application/catalog-sync.service.ts`, `catalog-sync.service.spec.ts`

**Interfaces:**
- Schema: `ocultoPorAdmin Boolean @default(false) @map("oculto_por_admin")`.
- Migración:
  ```sql
  -- El admin ocultó el producto a mano: reponer stock no debe re-publicarlo.
  -- Las filas existentes quedan en false (no se puede saber cuáles se ocultaron a mano).
  ALTER TABLE "productos" ADD COLUMN "oculto_por_admin" BOOLEAN NOT NULL DEFAULT false;
  ```
- Dominio (`product.ts`): `Product` gana `ocultoPorAdmin: boolean` (en la intersección junto a `disponible`); `export type ProductChanges = Partial<Omit<ProductData, 'id'>> & { ocultoPorAdmin?: boolean }`; `export function ocultoPorAdminTrasCambio(actual: { disponible: boolean }, cambios: { disponible?: boolean }): boolean | undefined` → `undefined` si `cambios.disponible` es `undefined` o igual a `actual.disponible`; si no, `!cambios.disponible`.
- Puerto: `create(data: ProductData & { ocultoPorAdmin: boolean })`, `update(id: string, data: ProductChanges)`, y nuevo `habilitarPorNombre(nombre: string): Promise<void>` (habilita solo variantes `disponible = false` y `ocultoPorAdmin = false`). `setDisponibilidadPorNombre` se queda para `agotar`.

- [ ] **Step 1: Write the failing tests**

`product.spec.ts`:
```ts
it('deshabilitar a mano lo marca oculto', () => expect(ocultoPorAdminTrasCambio({ disponible: true }, { disponible: false })).toBe(true));
it('habilitar a mano lo desmarca', () => expect(ocultoPorAdminTrasCambio({ disponible: false }, { disponible: true })).toBe(false));
it('no cambia ocultoPorAdmin si disponible no cambia', () => {
  expect(ocultoPorAdminTrasCambio({ disponible: false }, { disponible: false })).toBeUndefined();
  expect(ocultoPorAdminTrasCambio({ disponible: true }, {})).toBeUndefined();
});
```
`products.service.spec.ts`:
```ts
it('update fija ocultoPorAdmin al cambiar disponible', async () => {
  repo.findById.mockResolvedValue({ id: 'p1', disponible: true });
  repo.update.mockResolvedValue({ id: 'p1', display: 'X' });
  await service.update('p1', { disponible: false });
  expect(repo.update).toHaveBeenCalledWith('p1', { disponible: false, ocultoPorAdmin: true });
});
it('update sin cambio de disponible no toca ocultoPorAdmin', async () => {
  repo.findById.mockResolvedValue({ id: 'p1', disponible: false });
  repo.update.mockResolvedValue({ id: 'p1', display: 'X' });
  await service.update('p1', { disponible: false, precio: 100 });
  expect(repo.update.mock.calls[0][1]).not.toHaveProperty('ocultoPorAdmin');
});
it('create con disponible=false nace oculto por el admin', async () => {
  repo.create.mockResolvedValue({ id: 'p1', display: 'X' });
  await service.create({ id: 'p1', nombre: 'X', estilo: 'Y', display: 'X — Y', precio: 100, cat: 'reloj', disponible: false });
  expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ocultoPorAdmin: true }));
});
```
`catalog-sync.service.spec.ts` (añadir `habilitarPorNombre: jest.fn()` al fake):
```ts
it('reponer solo habilita variantes no ocultas por el admin', async () => {
  await service.reponer({ marca: null, modelo: 'Organizador', nombreProducto: null });
  expect(repo.habilitarPorNombre).toHaveBeenCalledWith('Organizador');
  expect(repo.setDisponibilidadPorNombre).not.toHaveBeenCalled();
});
it('un ingreso de mercancía no re-publica variantes ocultas por el admin', async () => {
  const { service, repo } = makeService([{ id: 'a', disponible: false, ocultoPorAdmin: true, marca: 'Rolex' }, { id: 'b', disponible: false, ocultoPorAdmin: false, marca: 'Rolex' }]);
  await service.sincronizarIngreso(ingreso);
  expect(repo.enable).toHaveBeenCalledWith(['b']);
});
```
`products.repository.spec.ts`:
```ts
it('habilitarPorNombre excluye las ocultas por el admin', async () => {
  const prisma = { product: { updateMany: jest.fn() } };
  await repoWith(prisma).habilitarPorNombre('Rolex Submariner');
  expect(prisma.product.updateMany).toHaveBeenCalledWith({
    where: { nombre: { equals: 'Rolex Submariner', mode: 'insensitive' }, disponible: false, ocultoPorAdmin: false },
    data: { disponible: true },
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test -- product catalog-sync` → FAIL.

- [ ] **Step 3: Implement**

- Schema + carpeta de migración con el SQL de Interfaces; `pnpm exec prisma validate && pnpm exec prisma generate`.
- `ProductsService.update`: `const actual = await this.findExisting(id); const oculto = ocultoPorAdminTrasCambio(actual, data); repo.update(id, oculto === undefined ? data : { ...data, ocultoPorAdmin: oculto })`. `create`: `repo.create({ ...data, ocultoPorAdmin: data.disponible === false })`.
- `ProductsRepository.create` escribe `ocultoPorAdmin: data.ocultoPorAdmin`; `createStub` no cambia (default `false`); `habilitarPorNombre` como en el test.
- `CatalogSyncService.reponer` → `this.products.habilitarPorNombre(this.nombreDe(ref))`; en `sincronizarIngreso` filtrar `!p.disponible && !p.ocultoPorAdmin`.
- `UpdateProductDto`/`CreateProductDto` **no** exponen `ocultoPorAdmin` (lo deduce la API).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test` → PASS; `pnpm exec tsc --noEmit` → sin errores.
Run: `DATABASE_URL=$INTEGRATION_DATABASE_URL pnpm exec prisma migrate deploy` y `INTEGRATION_DATABASE_URL=… pnpm test:int` → PASS (la vista `catalogo_publico` no cambia).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261110150000_productos_oculto_por_admin src/modules/products
git commit -m "feat(catalogo): no re-publicar productos ocultados a mano por el admin"
```

---

### Task 8: `GET /products` público solo con publicados y completos

**Files:**
- Modify: `src/modules/products/domain/product.ts` (`ProductFilter`)
- Modify: `src/modules/products/infrastructure/persistence/product-query.ts`, `product-query.spec.ts`
- Modify: `src/modules/products/application/products.service.ts`, `products.service.spec.ts`
- Modify: `src/modules/products/infrastructure/http/products.controller.ts:43-56`

**Interfaces:**
- Produces: `ProductFilter.soloPublicados?: boolean` (no lo expone `QueryProductDto`; `whitelist` lo descartaría).
- Produces: `ProductsService.findAll(query: ProductQuery, opts: { esAdmin: boolean })`.
- Decisión: "publicado" = `disponible = true`; "completo" = la regla de `estaIncompleto` invertida (`precio > 0`, `estilo <> ''`, `imgs` no vacío).

- [ ] **Step 1: Write the failing tests**

`product-query.spec.ts`:
```ts
it('soloPublicados exige disponible y producto completo, compatible con incompletos', () => {
  expect(buildProductWhere({ soloPublicados: true }).AND).toEqual([
    { disponible: true }, { precio: { gt: 0 } }, { estilo: { not: '' } }, { imgs: { isEmpty: false } },
  ]);
  expect(buildProductWhere({ soloPublicados: true, incompletos: true })).toHaveProperty('OR');
});
```
`products.service.spec.ts`:
```ts
it('sin rol ADMIN fuerza soloPublicados', async () => {
  await service.findAll({ marca: 'Fossil' }, { esAdmin: false });
  expect(repo.findAll).toHaveBeenCalledWith({ marca: 'Fossil', soloPublicados: true }, expect.anything());
});
it('con rol ADMIN no filtra publicados', async () => {
  await service.findAll({ marca: 'Fossil' }, { esAdmin: true });
  expect(repo.findAll).toHaveBeenCalledWith({ marca: 'Fossil' }, expect.anything());
});
```
Actualizar las llamadas existentes de `findAll(...)` en la spec a `findAll(..., { esAdmin: true })`.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test -- product-query products.service` → FAIL.

- [ ] **Step 3: Implement**

- `buildProductWhere`: si `filter.soloPublicados`, `where.AND = [...]` como en el test.
- `ProductsService.findAll`: `const filtro = opts.esAdmin ? filter : { ...filter, soloPublicados: true }`.
- Controller: `@UseGuards(OptionalJwtAuthGuard)` + `@ApiBearerAuth()` en `findAll`, parámetro `@CurrentUser() user?: { id: string; rol: string }`, llamada `findAll(query, { esAdmin: user?.rol === 'ADMIN' })`. `GET /products/:id` no cambia (fuera del alcance de la spec).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test` → PASS; `pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/products
git commit -m "fix(catalogo): GET /products público solo devuelve productos publicados y completos"
```

---

### Task 9: `idempotencyKey` en `POST /orders`

**Files:**
- Modify: `prisma/schema.prisma` (model `Order`)
- Create: `prisma/migrations/20261110150100_orders_idempotency_key/migration.sql`
- Modify: `src/modules/orders/application/commands.ts`, `src/modules/orders/infrastructure/http/dto/create-order.dto.ts`
- Modify: `src/modules/orders/application/ports/order-repository.port.ts`, `src/modules/orders/infrastructure/persistence/prisma-order.repository.ts`
- Modify: `src/modules/orders/application/use-cases/create-order.use-case.ts`
- Create: `src/modules/orders/application/use-cases/create-order.use-case.spec.ts`
- Modify: `src/modules/orders/infrastructure/persistence/prisma-order.repository.int-spec.ts` (de Task 3)

**Interfaces:**
- Schema: `idempotencyKey String? @unique @map("idempotency_key") @db.Uuid`.
- Migración:
  ```sql
  -- Clave que genera el checkout al montarse: un reintento (doble clic, red
  -- caída) devuelve el pedido ya creado en vez de duplicarlo.
  ALTER TABLE "orders" ADD COLUMN "idempotency_key" UUID;
  CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");
  ```
- `CreateOrderCommand.idempotencyKey?: string`; DTO: `@ApiProperty({ required: false }) @IsOptional() @IsUUID() idempotencyKey?: string`.
- `NewOrderData.idempotencyKey?: string | null`; `OrderSnapshot` no cambia (la clave no se devuelve).
- Puerto: `findByIdempotencyKey(key: string): Promise<CreatedOrder | null>` y `create(data: NewOrderData): Promise<{ order: CreatedOrder; nuevo: boolean }>` (`createConfirmed` no cambia).
- Caso de uso: `ConflictError('Esta clave de idempotencia ya se usó para otro pedido.')` si el pedido encontrado tiene `shippingInfo.email` distinto (comparado en minúsculas y sin espacios) del del comando.

- [ ] **Step 1: Write the failing unit tests**

`create-order.use-case.spec.ts` (fakes: `orders` con `findByIdempotencyKey`, `create`; `resolveOrderItems.execute` → `{ itemsData: [item], subtotal: 1000, total: 1000 }`; `fakeEventBus()`; si la Fase 1 añadió al constructor un puerto de conteo para el límite por email, pasarle un fake que devuelva `0`):
```ts
it('con una clave ya usada devuelve el pedido existente sin crear ni publicar', async () => {
  orders.findByIdempotencyKey.mockResolvedValue(pedidoExistente); // shippingInfo.email 'cliente@test.com'
  const r = await useCase.execute({ ...cmd, idempotencyKey: KEY });
  expect(r).toBe(pedidoExistente);
  expect(resolveOrderItems.execute).not.toHaveBeenCalled();
  expect(orders.create).not.toHaveBeenCalled();
  expect(events.publish).not.toHaveBeenCalled();
});
it('la clave repetida no cuenta para el límite de pedidos por email', async () => {
  // fake del límite de Fase 1 configurado como agotado (p. ej. conteo = 5)
  orders.findByIdempotencyKey.mockResolvedValue(pedidoExistente);
  await expect(useCase.execute({ ...cmd, idempotencyKey: KEY })).resolves.toBe(pedidoExistente);
});
it('rechaza la clave si el pedido existente es de otro email', async () => {
  orders.findByIdempotencyKey.mockResolvedValue(pedidoExistente);
  await expect(useCase.execute({ ...cmd, shippingInfo: { ...cmd.shippingInfo, email: 'otro@test.com' }, idempotencyKey: KEY })).rejects.toThrow(ConflictError);
});
it('no publica PedidoCreado si el repositorio devuelve nuevo=false (carrera)', async () => {
  orders.findByIdempotencyKey.mockResolvedValue(null);
  orders.create.mockResolvedValue({ order: pedidoExistente, nuevo: false });
  expect(await useCase.execute({ ...cmd, idempotencyKey: KEY })).toBe(pedidoExistente);
  expect(events.publish).not.toHaveBeenCalled();
});
it('sin clave crea y publica como siempre', async () => {
  orders.create.mockResolvedValue({ order: pedidoNuevo, nuevo: true });
  await useCase.execute(cmd);
  expect(orders.findByIdempotencyKey).not.toHaveBeenCalled();
  expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: null }));
  expect(events.of(PedidoCreado)).toHaveLength(1);
});
```

- [ ] **Step 2: Write the failing int-spec cases**

En `prisma-order.repository.int-spec.ts`:
```ts
it('creaciones concurrentes con la misma clave: un solo pedido', async () => {
  const key = randomUUID();
  const [a, b] = await Promise.all([repo.create(nuevoPedido({ idempotencyKey: key })), repo.create(nuevoPedido({ idempotencyKey: key }))]);
  expect([a.nuevo, b.nuevo].sort()).toEqual([false, true]);
  expect(a.order.id).toBe(b.order.id);
  expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);
});
it('findByIdempotencyKey devuelve el pedido con items, envío e historial', async () => {
  const key = randomUUID();
  const { order } = await repo.create(nuevoPedido({ idempotencyKey: key }));
  const encontrado = await repo.findByIdempotencyKey(key);
  expect(encontrado?.id).toBe(order.id);
  expect(encontrado?.items).toHaveLength(1);
  expect(encontrado?.statusHistory).toHaveLength(1);
});
```
Ajustar los tests de Task 3 a `const { order } = await repo.create(...)`. Cada `nuevoPedido()` usa su propio `orderNumber` aleatorio, para que la colisión sea solo por la clave.

- [ ] **Step 3: Run to verify fail**

Run: `pnpm test -- create-order` → FAIL. Run: `INTEGRATION_DATABASE_URL=… pnpm test:int -- prisma-order.repository` → FAIL (tras migrar la base).

- [ ] **Step 4: Implement**

- Schema + migración; `pnpm exec prisma validate && pnpm exec prisma generate`; `DATABASE_URL=$INTEGRATION_DATABASE_URL pnpm exec prisma migrate deploy`.
- Repositorio: `orderData` incluye `idempotencyKey: data.idempotencyKey ?? null`. `create`: `try { return { order: await …create(…), nuevo: true } } catch (e) { if (data.idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') { const existente = await this.findByIdempotencyKey(data.idempotencyKey); if (existente) return { order: existente, nuevo: false }; } throw e; }` (no depender de `meta.target`: con el adaptador pg su forma varía). `findByIdempotencyKey` usa `findUnique({ where: { idempotencyKey }, include: createInclude })`. `create` no corre dentro de `uow.run` (si una fase anterior lo metió en una, el P2002 abortaría la transacción: en ese caso sacar el `create` fuera o mover la recuperación fuera del `uow.run`).
- Caso de uso, al **inicio** de `execute` (antes del límite por email de la Fase 1 y de `resolveOrderItems`): si hay `idempotencyKey` y `findByIdempotencyKey` encuentra pedido → `return this.repetido(previo, cmd)`. Tras `create`, si `!nuevo` → `return this.repetido(order, cmd)` sin publicar. `private repetido(order: CreatedOrder, cmd: CreateOrderCommand): CreatedOrder` hace la comprobación de email de Interfaces.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test` → PASS; `INTEGRATION_DATABASE_URL=… pnpm test:int` → PASS; `pnpm exec tsc --noEmit` → sin errores.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261110150100_orders_idempotency_key src/modules/orders
git commit -m "feat(pedidos): idempotencyKey en POST /orders para no duplicar pedidos al reintentar"
```

---

### Task 10: Verificación de la fase

**Files:** ninguno nuevo.

- [ ] **Step 1: Gate completo**

Run: `pnpm exec tsc --noEmit` → sin errores.
Run: `pnpm lint:check` (script de la Fase 0) → 0 errores.
Run: `pnpm test` → todas las suites PASS, incluida `architecture.spec.ts`.
Run: `DATABASE_URL=$INTEGRATION_DATABASE_URL pnpm exec prisma migrate deploy && INTEGRATION_DATABASE_URL=… pnpm test:int` → PASS (`catalogo-publico`, `prisma-order.repository` y los int-specs de fases anteriores).

- [ ] **Step 2: Comprobar que no quedan restos**

Run: `git grep -n "TODO: si existing.orderId" src; git grep -n "ajustarStockPorModelo(ref.modelo, 1)" src; git grep -n "T23:59:59Z" src` → sin resultados.

- [ ] **Step 3: Commit (solo si hubo correcciones)**

```bash
git commit -am "chore: ajustes de verificación de la fase 3"
```
