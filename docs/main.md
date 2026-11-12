# C3LECT API — documentación técnica

> **Alcance:** backend del comercio electrónico C3LECT. La evidencia inspeccionada corresponde a este repositorio; el frontend de tienda se referencia como un sistema externo y no forma parte de este árbol.
>
> **Fecha de análisis:** 2026-11-11 · **Estado de las afirmaciones:** implementación verificada cuando se cita código, configuración o pruebas; despliegue actual marcado como reportado/configurado.

## Resumen

C3LECT API es una API REST para una tienda de relojería y perfumería de alta
gama. El backend expone catálogo, autenticación, cuentas, pedidos, pagos,
inventario, precios, compras, gastos, ventas, reseñas, auditoría y métricas
administrativas. Está implementado con NestJS y TypeScript, Prisma y
PostgreSQL, organizado como un monolito modular con límites de contexto y una
arquitectura por capas observada en `src/modules/`.

La aplicación se inicializa en [`src/main.ts`](../src/main.ts), registra
validación global, Helmet, CORS, throttling por IP, Swagger/OpenAPI y hooks de
cierre. La composición de módulos se encuentra en
[`src/app.module.ts`](../src/app.module.ts). El endpoint `GET /health` prueba la
conectividad de la aplicación con PostgreSQL mediante `SELECT 1`
([`src/app.controller.ts`](../src/app.controller.ts)).

## Producto, actores y límites

| Elemento | Descripción | Estado de evidencia |
|---|---|---|
| Tienda C3LECT | Comercio de relojes y perfumes con checkout, cuentas y pedidos. | **Verificado** en controladores, servicios, esquema y documentación. |
| Cliente | Consulta productos, puede comprar como invitado, autenticarse, consultar sus pedidos y crear reseñas de productos recibidos. | **Verificado** en `products`, `orders`, `auth`, `account` y `resenas`. |
| Administrador | Gestiona catálogo, pedidos, inventario, compras, gastos, ventas, promociones, reseñas, usuarios, auditoría y métricas. | **Verificado** en guards, `@Roles('ADMIN')` y controladores. |
| Frontend Bóveda C3LECT | Cliente web referenciado por el README y por `FRONTEND_URL`; no está incluido en este repositorio. | **Documentado / externo**, no verificable aquí. |
| MercadoPago, Resend y Meta | Integraciones configurables para pagos, correo transaccional y conversiones. | **Verificado** por adaptadores y variables de entorno; disponibilidad externa no verificada. |

## Arquitectura observada

Cada contexto de `src/modules/` sigue, con variaciones propias del dominio, la
separación `infrastructure → application → domain`. La prueba de arquitectura
en [`src/architecture.spec.ts`](../src/architecture.spec.ts) comprueba que:

- `domain` no depende de NestJS, Prisma ni de capas externas.
- `application` usa puertos y no importa infraestructura, ORM ni otros módulos.
- Los contextos se consumen mediante `public-api.ts`; los adaptadores de
  infraestructura traducen esas fachadas a puertos locales.
- Cada contexto es dueño de sus modelos Prisma, con una excepción explícita de
  lectura transversal para métricas.
- Los suscriptores de eventos se registran en el composition root y la prueba de
  arranque los verifica.

La vista lógica y la propuesta de infraestructura están documentadas en
[`architecture/architecture.md`](architecture/architecture.md). Los diagramas
editables y Mermaid se mantienen como artefactos separados:

- [Diagrama de componentes Mermaid](architecture/component-diagram.mmd)
- [Diagrama de componentes editable](architecture/component-diagram.drawio)
- [Infraestructura AWS propuesta](architecture/aws-infrastructure.drawio)
- [Despliegue actual reportado](architecture/current-deployment.drawio)

## Módulos y responsabilidades

| Contexto / módulo | Responsabilidad implementada | Entradas principales |
|---|---|---|
| `auth`, `users`, `account` | Identidad, JWT, OTP, recuperación, perfiles y direcciones. | `/auth`, `/users`, `/account` |
| `products` | Catálogo de productos y CRUD administrativo auditado. | `/products` |
| `promotions`, `marcas` | Promociones y consulta de marcas. | `/promotions`, `/marcas` |
| `orders` | Checkout, pedidos de invitados/autenticados, consulta y estados. | `/orders` |
| `payments` | Preferencias MercadoPago, pagos pendientes, webhook y estado de pago. | `/payments` |
| `inventario`, `precios` | Stock, movimientos, costos y precios derivados. | `/inventario`, `/precios` |
| `compras`, `ventas`, `gastos` | Compras a proveedor, ventas históricas y gastos operativos. | `/compras`, `/ventas`, `/gastos` |
| `resenas` | Reseñas de compradores y moderación administrativa. | `/resenas` |
| `metrics` | Read model administrativo de resumen, finanzas, ventas y compras. | `/metrics` |
| `audit` | Consulta del registro de auditoría. | `/audit` |
| `notifications` | Correos reaccionando a eventos; no expone controller ni tablas propias. | Eventos de dominio |
| `meta-conversions` | Envío opcional de conversiones a Meta CAPI; reacciona a eventos. | Eventos de dominio |
| `shared` | Prisma, transacciones, bus de eventos, guards, filtro de excepciones y puertos compartidos. | Infraestructura transversal |

## API HTTP documentada

La aplicación genera Swagger en `/api/docs`. Los siguientes grupos se derivan
de los controladores actuales; la autenticación indicada corresponde a los
guards y decoradores presentes en código.

| Grupo | Endpoints implementados |
|---|---|
| Salud | `GET /health` |
| Auth | `POST /auth/register`, `/login`, `/request-otp`, `/verify-otp`, `/request-password-reset`, `/reset-password`, `/refresh`; `GET /auth/me`; `POST /auth/logout` |
| Cuenta | `GET/PATCH /account/profile`; `GET/POST /account/addresses`; `PATCH /account/addresses/:id`; `POST /account/addresses/:id/principal`; `DELETE /account/addresses/:id` |
| Productos | `GET /products`, `GET /products/:id`; `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` (ADMIN) |
| Promociones | `GET /promotions`, `GET /promotions/:id`; `POST /promotions`, `PATCH /promotions/:id`, `DELETE /promotions/:id` (ADMIN) |
| Pedidos | `POST /orders` (JWT opcional); `GET /orders`, `GET /orders/:id` (JWT); `PATCH /orders/:id/status` (ADMIN) |
| Pagos | `POST /payments/create`, `POST /payments/create-pending`, `POST /payments/webhook`; `GET /payments/:orderId` |
| Inventario | `GET /inventario/stock`; `GET /inventario`, `POST /inventario/seed` (ADMIN) |
| Administración | `/compras`, `/ventas`, `/gastos`, `/precios`, `/marcas`, `/users`, `/audit`, `/metrics` y moderación de `/resenas` según los guards de cada controller |

La validación de DTOs usa `ValidationPipe` global con `whitelist` y `transform`.
El filtro global [`global-exception.filter.ts`](../src/shared/infrastructure/http/filters/global-exception.filter.ts)
traduce `DomainError` a respuestas HTTP. Las formas exactas de cada body y
respuesta deben consultarse en sus DTOs y servicios; este overview no sustituye
el contrato Swagger.

## Flujos de negocio destacados

### Catálogo

`ProductsController` recibe filtros opcionales como categoría, marca, género,
rango de precio, disponibilidad, destacado y ordenamiento. El listado y el
detalle son públicos; las mutaciones exigen JWT y rol `ADMIN`. La base contiene
campos para relojes y notas de perfumería en el modelo `Product` de
[`prisma/schema.prisma`](../prisma/schema.prisma).

### Checkout y pago con MercadoPago

El flujo recomendado es `POST /payments/create-pending`: cotiza items y
promociones a través de la fachada de pedidos, crea una preferencia de
MercadoPago y guarda un `Payment` con `draftPayload`, pero todavía no crea un
`Order`. El webhook público retorna `{ received: true }` inmediatamente y
procesa de forma asíncrona. Verifica `x-signature` y `x-request-id`, consulta el
pago en MercadoPago, aplica el estado terminal una sola vez y, cuando es
aprobado, materializa el pedido confirmado dentro de una unidad de trabajo.

La confirmación publica `PedidoConfirmado` dentro de la transacción. Inventario
descuenta stock y ventas registra la salida mediante suscriptores
`in-transaction`; notificaciones, comprobante y Meta se ejecutan `after-commit`.
Los detalles y ramas están en
[`docs/use-cases/checkout-mercadopago.md`](use-cases/checkout-mercadopago.md).

### Pedidos

`POST /orders` acepta invitado o usuario autenticado. La consulta de pedidos
exige JWT: un cliente ve los suyos y un administrador puede ver todos. El cambio
de estado exige `ADMIN` y publica un evento para notificaciones. La creación
confirmada usada por MercadoPago se documenta junto al webhook por compartir la
misma transacción y efectos de stock/ventas.

### Eventos y efectos

El bus [`InProcessEventBus`](../src/shared/infrastructure/events/in-process-event-bus.ts)
separa suscriptores `in-transaction` de `after-commit`. Entre los efectos
observados están: `PedidoConfirmado → inventario → ventas`,
`PagoAprobado → notificaciones + Meta`, `CompraRegistrada → inventario +
precios`, y `UsuarioRegistrado → pedidos invitados + bienvenida`.

## Persistencia

Prisma usa PostgreSQL y el esquema actual contiene identidad, direcciones,
tokens, OTP y resets; productos, promociones y reseñas; pedidos y sus items,
envío, historial y pagos; inventario, precios, compras, ventas, gastos y
auditoría. Las migraciones también crean las vistas públicas
`catalogo_publico` y `resenas_publicas` con permisos de solo lectura para
clientes anónimos/autenticados, mientras la API conserva la escritura de las
tablas privadas.

La ownership de tablas no es solo una convención: la prueba de arquitectura
detecta accesos Prisma fuera del contexto dueño. `metrics` es una excepción de
lectura transversal y no contiene operaciones de escritura según la prueba.

## Seguridad y operación observadas

- JWT con access/refresh tokens, Passport y `RolesGuard` para ADMIN/CLIENTE.
- Contraseñas almacenadas mediante Argon2 en el servicio de autenticación.
- OTP y reset de contraseña con respuestas uniformes en las solicitudes
  sensibles para evitar enumeración de correos.
- Throttling global de 300 solicitudes/minuto por IP y de 8 solicitudes/minuto
  para rutas marcadas como `auth`; el webhook omite throttling.
- Helmet, CORS de orígenes configurados, `ValidationPipe`, filtro de errores de
  dominio y auditoría de mutaciones de productos/pedidos.
- `trust proxy = 1` y `enableShutdownHooks()` están configurados para el host
  reportado en Render.
- CI en GitHub Actions ejecuta `pnpm test`, `pnpm build` y lint no bloqueante.
- El README reporta API en Render, base/lecturas públicas en Supabase y frontend
  en GitHub Pages. No se ejecutó una comprobación remota; esos datos quedan
  como **reportados/configurados**, no como prueba de disponibilidad actual.

## Índice de flujos detallados

- [Catálogo y administración de productos](use-cases/catalogo.md)
- [Autenticación y sesión](use-cases/autenticacion.md)
- [Checkout pendiente y webhook de MercadoPago](use-cases/checkout-mercadopago.md)
- [Creación confirmada y efectos transaccionales del pedido](use-cases/pedido-confirmado.md)

## Evidencia y límites

La documentación se construyó desde el código TypeScript, módulos, DTOs,
pruebas, Prisma schema/migrations, `README.md`, `ARCHITECTURE.md` y CI. No se
ejecutó la API ni se consultó el endpoint remoto; no se inspeccionó el
repositorio del frontend referenciado. Por tanto, el estado visual real de la
tienda, sus interacciones UX y su despliegue efectivo no se pueden verificar
desde este repositorio.

## Resumen de cambios documentales

- **Creados:** este overview, cuatro flujos de uso, paquete de arquitectura,
  Blueprint HTML y presentación HTML.
- **Sin cambios:** código de aplicación, esquema Prisma, migraciones y
  configuración de despliegue.
- **Pendiente/evidencia faltante:** inspección del frontend externo, ejecución
  remota, métricas reales de operación y validación visual en navegador/Draw.io.
