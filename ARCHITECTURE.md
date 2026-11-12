# Arquitectura de c3lect-api

Monolito modular con Clean Architecture. Cada carpeta de `src/modules/` es un
**bounded context**: tiene sus propias capas, es dueño de sus tablas y solo se
comunica con los demás por su **API pública** (consultas) o por **eventos de
dominio** (efectos). Las reglas de este documento las verifica
`src/architecture.spec.ts` en cada `pnpm test`.

## Las cuatro capas de un módulo

```
modules/<contexto>/
├── domain/            Reglas del negocio. TS puro: sin Nest, sin Prisma.
│                      Entidades, value objects, funciones puras, eventos.
├── application/       Casos de uso. Orquestan el dominio a través de puertos.
│   └── ports/         Interfaces (+ token de DI) que la infraestructura implementa.
├── infrastructure/    Adaptadores. Lo único que conoce frameworks y otros contextos.
│   ├── http/          Controllers + DTOs con class-validator (entrada).
│   ├── persistence/   Repositorios Prisma (salida).
│   ├── events/        Suscriptores a eventos de otros contextos (entrada).
│   └── adapters/      Implementaciones de puertos sobre la public-api de otro contexto (salida).
├── public-api.ts      Lo único que otros módulos pueden importar.
└── <contexto>.module.ts   Composition root: conecta cada puerto con su adaptador.
```

**Regla de dependencia:** `infrastructure → application → domain`. Nunca al revés.

| Capa | Puede importar | No puede importar |
|---|---|---|
| `domain` | su propio dominio, `shared/domain` | `@nestjs/*`, `@prisma/*`, class-validator, application, infrastructure |
| `application` | su dominio, sus puertos, `shared/domain`, `shared/application`; de `@nestjs/common` solo `Injectable`, `Inject`, `Logger` | `@prisma/*`, `@nestjs/config`, infrastructure, **cualquier otro módulo** |
| `infrastructure` | todo lo anterior, frameworks, la `public-api` de otros módulos | internals de otros módulos |

### Casos de uso y servicios de aplicación

`application/` admite **dos formas**, con las mismas reglas de dependencia
(solo puertos, sin Prisma):

- **Servicio de aplicación** (`application/<nombre>.service.ts`): una clase
  `@Injectable` con varios métodos. Es la forma válida para CRUD simple y
  consultas sin coordinación entre contextos. Ejemplos reales:
  `compras.service.ts`, `gastos.service.ts`, `marcas.service.ts`.
- **Caso de uso** (`application/use-cases/<verbo>-<sustantivo>.use-case.ts`):
  una clase con un método. Se reserva para flujos con **transacción y
  eventos**. Ejemplos: `UpdateOrderStatusUseCase`, `HandleWebhookUseCase`.

Criterio de elección: si el flujo abre `uow.run` o publica eventos de dominio,
es un caso de uso; si solo lee y escribe tablas propias, es un servicio.

Los tipos de entrada que define el dominio se llaman `…Cambios` o `…Comando`,
nunca `…Dto`: el sufijo Dto queda para `infrastructure/http/dto`
(por ejemplo `CompraCambios` y `VentaCambios`, que implementan los DTOs de
actualización).

Los errores de negocio se lanzan como `DomainError` (`shared/domain/domain-error.ts`):
`BusinessRuleViolation` (400), `UnauthorizedError` (401), `ForbiddenError` (403),
`NotFoundError` (404), `ConflictError` (409). `GlobalExceptionFilter` los
traduce a HTTP; el dominio no sabe que existe HTTP.

Los DTOs HTTP `implements` el comando de aplicación correspondiente
(`CreateOrderDto implements CreateOrderCommand`): la validación es asunto del
adaptador, y TypeScript avisa si DTO y comando se desincronizan.

## Shared kernel (`src/shared/`)

- `domain/`: `DomainError`, `DomainEvent`, y la identidad marca/modelo y las
  categorías que comparten catálogo, inventario, compras y ventas.
- `application/ports/`: `UNIT_OF_WORK`, `EVENT_BUS`, `AUDIT_LOG`.
- `infrastructure/`: `PrismaService`, `PrismaTransactionHost` (transacción
  ambiental + unidad de trabajo), `InProcessEventBus`, guards y decoradores de
  auth, el filtro global de excepciones.

## Bounded contexts y dueños de tablas

| Contexto | Módulo(s) | Tablas | Publica | Escucha |
|---|---|---|---|---|
| Identidad | `auth`, `users`, `account` | `users`, `addresses`, `refresh_tokens`, `otp_codes`, `password_resets` | `UsuarioRegistrado`, `CodigoDeAccesoSolicitado`, `RestablecimientoDeClaveSolicitado` | — |
| Catálogo | `products` | `productos` | — | `StockAgotado`, `StockRepuesto`, `MercanciaIngresada` |
| Precios | `precios` | `calculo_precios` | — | `CompraRegistrada`, `CompraCorregida`, `InventarioRecalculado` |
| Marcas | `marcas` | — (lee catálogo y compras) | — | — |
| Promociones | `promotions` | `promotions` | — | — |
| Pedidos | `orders` | `orders`, `order_items`, `shipping_info`, `order_status_history` | `PedidoCreado`, `PedidoConfirmado`, `ConfirmacionDePedidoRevertida`, `EstadoDePedidoCambiado` | `UsuarioRegistrado` |
| Pagos | `payments` | `payments` | `PagoAprobado`, `PagoSinPedido` | — |
| Inventario | `inventario` | `inventario_maestro` | `StockAgotado`, `StockRepuesto`, `MercanciaIngresada`, `SalidaPorPedidoRegistrada`, `InventarioRecalculado` | `PedidoConfirmado`, `VentasDePedidoAnuladas`, `VentaManualRegistrada`, `VentaEliminada`, `CompraRegistrada`, `CompraCorregida` |
| Ventas | `ventas` | `historical_sales` | `VentaManualRegistrada`, `VentaEliminada`, `VentasDePedidoAnuladas` | `SalidaPorPedidoRegistrada`, `ConfirmacionDePedidoRevertida` |
| Compras | `compras` | `purchases` | `CompraRegistrada`, `CompraCorregida` | — |
| Gastos | `gastos` | `expenses` | — | — |
| Reseñas | `resenas` | `resenas` | — | — (consulta pedidos e identidad por sus fachadas) |
| Auditoría | `audit` | `audit_log` | — | — (expone el puerto global `AUDIT_LOG`) |
| Notificaciones | `notifications` | — | — | pedidos, pagos e identidad (manda los correos) |
| Medición | `meta-conversions` | — | — | `PedidoCreado`, `PagoAprobado`, `VentaManualRegistrada` |
| Métricas | `metrics` | — | — | — |

**Excepciones declaradas (modelos de lectura, nunca escriben):**

- `metrics/infrastructure/read-model/`: el dashboard admin. Lo verifica el
  test de arquitectura.
- **Vista `catalogo_publico`** (migración `20261029000000`): el contrato entre
  la tienda y la base. La tienda lee el catálogo directo de Supabase para no
  depender de que la API de Render esté despierta, pero ya no lee tablas: lee
  esta vista, que resuelve qué producto se publica, su stock y su precio con
  promociones. Replica en SQL reglas que también viven en TypeScript (modelo
  derivado, búsqueda de stock, mejor descuento); `pnpm test:int` verifica que
  ambos lados den lo mismo contra un Postgres real:

  ```bash
  INTEGRATION_DATABASE_URL=postgresql://c3lect:c3lect@localhost:5433/c3lect_dev pnpm test:int
  ```

- **Vista `resenas_publicas`** (migración `20261105000000`): el mismo trato
  para las reseñas. La API escribe la tabla `resenas` (solo quien recibió el
  producto en un pedido ENTREGADO, una vez por producto) y la tienda lee la
  vista, que expone solo las PUBLICADAS y nunca el `user_id`. `anon` y
  `authenticated` no tienen acceso a la tabla, y sobre la vista solo `SELECT`:
  al ser un `SELECT` simple, Postgres la consideraría actualizable.

### Despliegue del contrato del catálogo (expand / contract)

Se desplegó en tres pasos, ya completados:

1. *Expand* (`20261029000000_catalogo_publico_view`): crea la vista y le da
   lectura a `anon`, sin quitar nada; la tienda vieja siguió funcionando.
2. Se desplegó el frontend que lee `catalogo_publico`.
3. *Contract* (`20261029000100_revoke_public_catalog_tables`): `anon` y
   `authenticated` pierden acceso a `productos`, `promociones` e
   `inventario_maestro`; solo pueden leer la vista.

Supabase marca la vista como "Security Definer View": es intencional. La vista
lee las tablas con los permisos de su dueño precisamente para que `anon` no
necesite acceso a ellas. Cambiarla a `security_invoker` rompe la tienda.

Un cambio futuro al contrato sigue el mismo orden: primero lo que agrega
(columna nueva en la vista), luego el frontend, y al final lo que quita.

## Consultas vs. efectos entre contextos

- **Consulta síncrona** ("¿cuánto stock hay?", "¿cuál es el precio con
  promoción?"): el módulo que pregunta define un **puerto** en su
  `application/ports`, y un **adaptador** en su `infrastructure/adapters` lo
  implementa llamando a la **fachada** que el otro módulo expone en su
  `public-api.ts`. Ejemplo: `orders/application/ports/price-quote.port.ts` →
  `orders/infrastructure/adapters/price-quote.adapter.ts` → `PromotionsFacade`.
- **Efecto** ("se confirmó un pedido, hay que descontar stock"): el módulo
  publica un **evento de dominio** y el otro reacciona en un suscriptor
  (`infrastructure/events/*.subscribers.ts`). El publicador no sabe quién escucha.

## Eventos y transacciones

El bus tiene dos fases (`shared/application/ports/event-bus.port.ts`):

- **`in-transaction`**: el handler corre dentro de la unidad de trabajo del
  publicador, en orden y esperado. Si lanza, se revierte todo. Lo usan los
  efectos que deben ser atómicos: stock, ventas, precios, catálogo.
- **`after-commit`**: corre solo si la transacción confirmó, sin bloquear la
  respuesta. Lo usan los efectos externos: correos y Meta. Un correo nunca sale
  por una operación que terminó en rollback.

Los repositorios no reciben la transacción por parámetro: usan
`PrismaTransactionHost.client`, que devuelve la transacción en curso (guardada
en `AsyncLocalStorage`) o el cliente normal. Por eso un caso de uso de orders
y los handlers de inventario y ventas escriben en sus propias tablas dentro de
**una** transacción sin importarse entre sí.

Ejemplo: confirmar un pedido.

```
UpdateOrderStatusUseCase (uow.run)
├─ orders.transitionStatus()                    → orders, order_status_history
├─ publish PedidoConfirmado          [in-tx]
│   └─ inventario: descuenta stock               → inventario_maestro
│       ├─ publish StockAgotado (si llegó a 0)  [in-tx] → catálogo deshabilita productos
│       └─ publish SalidaPorPedidoRegistrada    [in-tx] → ventas registra las ventas
└─ publish EstadoDePedidoCambiado    [after-commit] → notificaciones manda correos
```

El inverso: `cancelar CONFIRMADO → ConfirmacionDePedidoRevertida [in-tx] → ventas borra sus filas → VentasDePedidoAnuladas [in-tx] → inventario repone`.

Si inventario lanza "stock insuficiente", no queda ni el cambio de estado, ni
ventas, ni correo.

Se usa un bus propio en vez de `@nestjs/event-emitter` porque aquel corre los
listeners en paralelo y por defecto se traga sus errores. Aquí un handler
`in-transaction` que falla debe abortar la transacción, y los handlers deben
correr en orden sobre el mismo cliente transaccional.

## Cómo agregar algo

**Un caso de uso nuevo en un módulo existente:** la regla va en `domain/` (y
su spec), la orquestación en `application/use-cases/` con sus dependencias
como puertos, y el controller en `infrastructure/http/` llama al caso de uso.
Antes de crear el archivo aplica el criterio de
[Casos de uso y servicios de aplicación](#casos-de-uso-y-servicios-de-aplicación):
un CRUD simple es un método más del servicio del módulo; solo un flujo
transaccional o que publica eventos va en `use-cases/`.

**Necesito datos de otro módulo:** no importes su repositorio. Define un
puerto en tu `application/ports/`, agrega el método a la fachada del otro
módulo (y expórtala en su `public-api.ts`), e implementa el puerto con un
adaptador en tu `infrastructure/adapters/`.

**Necesito que otro módulo reaccione a algo:** publica un evento desde tu
caso de uso (clase en tu `domain/`, exportada en tu `public-api.ts`) y
suscríbete en el otro módulo. Elige la fase: `in-transaction` si debe ser
atómico, `after-commit` si es un efecto externo.

## Camino a microservicios

Si un contexto necesita escalar aparte (p. ej. notificaciones o pagos), se
extrae sin tocar dominio ni casos de uso: el `InProcessEventBus` se reemplaza
por un adaptador de broker (RabbitMQ/SQS) con patrón outbox, y las fachadas que
consulta ese contexto se reemplazan por adaptadores HTTP. Los efectos que hoy
son `in-transaction` entre contextos separados pasan a ser una saga con
compensaciones (p. ej. `StockInsuficiente` → cancelar pedido → reembolso).
