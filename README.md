# C3LECT API

Backend de producción del e-commerce **C3LECT** — relojería y perfumería de alta gama, Medellín, Colombia.

API REST construida con NestJS, Prisma y PostgreSQL como **monolito modular con Clean Architecture**. Cubre el ciclo completo del negocio: catálogo, autenticación, pedidos, pagos con MercadoPago, inventario, costos y métricas financieras.

📘 **Documentación interactiva (Swagger):** `/api/docs`, disponible solo si `NODE_ENV !== 'production'` (en producción no se expone; levántala en local, ver [Puesta en marcha](#puesta-en-marcha)).
*La API se aloja en el tier gratuito de Render — la primera petición puede tardar ~50 s en despertar la instancia.*

🛍️ **Frontend que la consume:** [Bóveda C3LECT](https://cetremore26.github.io/boveda-c3lect-v2/) · [código](https://github.com/cetremore26/boveda-c3lect-v2)

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| ORM | Prisma 6 + adaptador `@prisma/adapter-pg` |
| Base de datos | PostgreSQL |
| Autenticación | Passport JWT · access + refresh tokens · Argon2 · registro con código por correo · 2FA del admin |
| Pagos | MercadoPago (Checkout Pro + webhooks firmados) |
| Correo | Resend |
| Documentación | Swagger / OpenAPI (fuera de producción) |
| Seguridad | Helmet · CORS estricto · `@nestjs/throttler` · ValidationPipe global |
| Runtime | Node.js ≥ 20 · pnpm |

---

## Arquitectura

Cada carpeta de `src/modules/` es un **bounded context** (pedidos, pagos, inventario, catálogo…) con cuatro capas, y las dependencias solo apuntan hacia adentro:

```
modules/<contexto>/
├── domain/           reglas del negocio · TypeScript puro, sin Nest ni Prisma
├── application/      casos de uso · dependen de puertos (interfaces), no de implementaciones
├── infrastructure/   controllers, repositorios Prisma, adaptadores a otros contextos
└── public-api.ts     lo único que otros módulos pueden importar
```

- **Cada contexto es dueño de sus tablas.** Ningún módulo escribe en las tablas de otro.
- **Consultas** entre contextos: por la fachada que cada uno expone en su `public-api.ts`.
- **Efectos** entre contextos: por **eventos de dominio**. Al confirmar un pedido, orders publica `PedidoConfirmado`; inventario descuenta stock, ventas registra la venta y el catálogo oculta el producto si se agotó. Orders no sabe que esos módulos existen.
- Las reglas se verifican en cada `pnpm test` con un test de arquitectura (`src/architecture.spec.ts`): un import que las rompa hace fallar la suite.

Detalle completo (capas, dueños de tablas, mapa de eventos, cómo agregar funcionalidades): **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Decisiones de diseño que vale la pena mirar

**Confirmación atómica entre contextos.**
El cambio de estado del pedido, el descuento de stock y el registro de ventas viven en tres módulos distintos, pero ocurren en **una sola transacción**: los repositorios toman la transacción en curso de un contexto ambiental (`AsyncLocalStorage`) y los handlers de eventos corren dentro de ella. Si no hay stock, no queda nada a medias. Los correos y el reporte a Meta se envían **solo después del commit**: nunca sale un correo de una operación revertida.

**Pago pendiente antes que pedido.**
`POST /payments/create-pending` cotiza el carrito y genera la preferencia de MercadoPago **sin crear el pedido**. El pedido solo nace —ya confirmado— cuando el webhook informa que el pago fue aprobado. Resultado: un checkout abandonado o rechazado no deja pedidos huérfanos ensuciando la base ni el inventario.

**Webhook a prueba de reintentos.**
El endpoint procesa la notificación **antes** de responder: `200` si se procesó o no aplica, `401` si la firma es inválida y `500` ante un fallo inesperado, para que MercadoPago reintente. Es idempotente (una entrega repetida no duplica pedidos). La firma `x-signature` se compara con `timingSafeEqual` y debe caer dentro de una ventana de 72 horas (MercadoPago reutiliza la firma en los reintentos). Se verifican monto y moneda contra el total del pago. Un doble cobro o un reembolso no se ignoran: generan una alerta al admin (ver [Pagos: eventos y webhook](ARCHITECTURE.md#pagos-eventos-y-webhook)).

**Respuestas que no filtran información.**
`request-otp` y `request-password-reset` devuelven siempre la misma respuesta exista o no el correo. Sumado al throttling por ruta (8 intentos/minuto en rutas sensibles) y a un límite de códigos por email (3 cada 15 minutos), cierra la enumeración de usuarios. En el login, un usuario inexistente igual verifica contra un hash Argon2 ficticio para igualar tiempos de respuesta.

**Autorización por rol, no por confianza.**
`RolesGuard` + decorador `@Roles('ADMIN')`; el guard relee el rol del usuario en base en cada petición (no confía en el del JWT). El admin además pasa por un segundo factor al iniciar sesión. Los clientes solo ven sus propios pedidos (y su pago); el admin ve todo. El checkout de invitado usa `OptionalJwtAuthGuard`: funciona sin sesión, pero si hay JWT vincula el pedido a la cuenta.

**Registro con código y 2FA.**
Nadie crea una cuenta sin verificar su correo: `request-otp` → `verify-otp` entrega un `registrationToken` de 15 minutos que `register` exige. El login de un ADMIN responde `requiresSecondFactor` y solo `POST /auth/login/2fa` entrega los tokens. Detalle y diagramas en [Autenticación y sesión](ARCHITECTURE.md#autenticación-y-sesión).

**Trazabilidad.**
Toda mutación de producto o pedido queda registrada en `audit_log` con usuario, entidad, acción y descripción. El historial de estados de cada pedido se guarda en tabla aparte.

**Base de datos cerrada por defecto.**
RLS habilitado en todas las tablas y `anon`/`authenticated` solo pueden leer las vistas `catalogo_publico` y `resenas_publicas`; un test de integración lo verifica. Ver [Seguridad de la base de datos](ARCHITECTURE.md#seguridad-de-la-base-de-datos).

**Cierre ordenado.**
`trust proxy = 1` (un solo hop, el de Render) para obtener la IP real sin aceptar headers falsificados, y `enableShutdownHooks()` para que un redeploy no corte a mitad de una escritura.

---

## Módulos

| Módulo | Ruta base | Qué hace |
|---|---|---|
| Auth | `/auth` | Registro con código, login, 2FA del admin, OTP, refresh, reset, logout |
| Account | `/account` | Perfil y direcciones del cliente |
| Products | `/products` | Catálogo público + CRUD admin con auditoría |
| Promotions | `/promotions` | Promociones por producto, categoría o marca |
| Orders | `/orders` | Checkout invitado y autenticado, estados, notificaciones |
| Payments | `/payments` | Preferencias MercadoPago, webhook, estado de pago |
| Inventario | `/inventario` | Inventario maestro, stock público, seed desde compras |
| Precios | `/precios` | Cálculo de costo total y precios público/cierre |
| Compras | `/compras` | Registro de compras a proveedor |
| Gastos | `/gastos` | Gastos operativos |
| Ventas | `/ventas` | Ventas históricas |
| Metrics | `/metrics` | Dashboard admin: resumen, financiero, ventas y compras |
| Marcas | `/marcas` | Catálogo de marcas |
| Reseñas | `/resenas` | Reseñas de productos recibidos; moderación y respuesta del admin |
| Users | `/users` | Gestión de usuarios |
| Audit | `/audit` | Consulta del log de auditoría |
| Notifications | — | Correos transaccionales, en reacción a eventos |
| Meta Conversions | — | Compras reportadas a Meta (Conversions API), en reacción a eventos |

---

## Endpoints principales

### Autenticación — `/auth`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/register` | — | Registro con `registrationToken` (obtenido tras verificar el código) |
| `POST` | `/auth/login` | — | Login por contraseña (8 req/min); para ADMIN responde `requiresSecondFactor` |
| `POST` | `/auth/login/2fa` | — | Segundo factor del admin: `challengeToken` + código |
| `POST` | `/auth/request-otp` | — | Envía código OTP por correo |
| `POST` | `/auth/verify-otp` | — | Verifica el código: emite tokens o, si no hay cuenta, `registrationToken` |
| `POST` | `/auth/request-password-reset` | — | Envía enlace de recuperación |
| `POST` | `/auth/reset-password` | — | Cambia contraseña e invalida sesiones (token `<id>.<secreto>`) |
| `POST` | `/auth/refresh` | — | Renueva el par de tokens |
| `GET` | `/auth/me` | JWT | Perfil del usuario autenticado |
| `POST` | `/auth/logout` | JWT | Invalida todos los refresh tokens |

### Productos — `/products`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/products` | — | Lista con filtros: `categoria`, `marca`, `genero`, `rangoPrecio`, `soloDisponibles`; sin ADMIN solo publicados y completos |
| `GET` | `/products/:id` | — | Detalle |
| `POST` | `/products` | ADMIN | Crear (auditado) |
| `PATCH` | `/products/:id` | ADMIN | Editar (auditado) |
| `DELETE` | `/products/:id` | ADMIN | Eliminar (auditado) |

### Pedidos — `/orders`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/orders` | Opcional | Crear pedido (invitado o autenticado). `idempotencyKey` opcional; máx. 20 ítems, cantidad ≤ 10 por ítem, 5 pedidos/hora por email y solo métodos sin pasarela (transferencia, contraentrega, Nequi, Daviplata) |
| `GET` | `/orders` | JWT | Admin: todos con filtros. Cliente: solo los suyos |
| `GET` | `/orders/:id` | JWT | Detalle con items, envío e historial |
| `PATCH` | `/orders/:id/status` | ADMIN | Cambiar estado + notificar por correo |

### Pagos — `/payments`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/payments/create` | Dueño o ADMIN | Preferencia MercadoPago para pedido existente |
| `POST` | `/payments/create-pending` | Opcional | Preferencia sin crear el pedido todavía |
| `POST` | `/payments/webhook` | — | Webhook de MercadoPago (firma verificada) |
| `GET` | `/payments/:orderId` | Dueño o ADMIN | Estado del pago de un pedido (respuesta reducida: sin datos del cliente ni ids de MercadoPago) |

### Métricas — `/metrics` *(solo ADMIN)*
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/metrics/summary` | Resumen del dashboard |
| `GET` | `/metrics/financial` | Resumen financiero completo |
| `GET` | `/metrics/sales` | Ventas históricas paginadas |
| `GET` | `/metrics/purchases` | Compras históricas paginadas |

### Inventario — `/inventario`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/inventario` | ADMIN | Inventario maestro con stock y capital |
| `GET` | `/inventario/stock` | — | Stock público por modelo (limita el carrito) |
| `POST` | `/inventario/seed` | ADMIN | Poblar desde compras históricas |

---

## Modelo de datos

```
User ──< RefreshToken
     ──< PasswordReset
     ──< Address
     ──< Order ──< OrderItem
               ──  ShippingInfo
               ──< OrderStatusHistory
               ──< Payment
               ──< HistoricalSale
     ──< Resena

Product          Promotion        OtpCode          AuditLog
InventarioMaestro    PrecioProducto    Purchase    Expense
```

**Enums:** `Rol` · `EstadoPedido` · `MetodoPago` · `EstadoPago` (incluye `REEMBOLSADO`)

Campos a tener presentes: `OtpCode.intentos` y `OtpCode.proposito` (`LOGIN` | `ADMIN_2FA`), `Order.idempotencyKey` (único, evita pedidos duplicados) y `Product.ocultoPorAdmin` (un producto oculto a propósito no reaparece por stock).

Esquema completo en [`prisma/schema.prisma`](prisma/schema.prisma).

---

## Puesta en marcha

Requisitos: Node.js ≥ 20, pnpm y una instancia de PostgreSQL.

```bash
pnpm install                  # instala y ejecuta prisma generate
cp .env.example .env          # completa las variables
pnpm prisma migrate deploy    # aplica las migraciones
pnpm start:dev                # http://localhost:3000
```

Swagger local: `http://localhost:3000/api/docs` (solo se expone si `NODE_ENV !== 'production'`).

### Entorno de desarrollo aislado

Para probar sin tocar la base ni los servicios de producción, usa una base local desechable y un archivo de entorno aparte. `.env.development.local` está en `.gitignore`.

```bash
# Postgres local en Docker (puerto 5433)
docker run -d --name c3lect-dev-db -e POSTGRES_USER=c3lect -e POSTGRES_PASSWORD=c3lect \
  -e POSTGRES_DB=c3lect_dev -p 5433:5432 postgres:16
# Supabase trae el esquema `extensions`; en Postgres normal hay que crearlo
docker exec c3lect-dev-db psql -U c3lect -d c3lect_dev -c "CREATE SCHEMA IF NOT EXISTS extensions;"

# Variables de prueba: base local, MercadoPago TEST-…, Resend falso, Meta desactivado
cp .env.development.example .env.development.local
npx dotenv -e .env.development.local -- npx prisma migrate deploy
npx dotenv -e .env.development.local -- npx nest start --watch
```

> Usa siempre el prefijo `npx dotenv -e .env.development.local --`. Sin él, la API carga `.env`. Antes de migrar, confirma que Prisma imprima `localhost:5433`.

### Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `JWT_SECRET` | Firma de los access tokens |
| `JWT_EXPIRES_IN` | Vida del access token (por defecto `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Vida del refresh token (por defecto `7d`) |
| `PORT` | Puerto del servidor |
| `FRONTEND_URL` | Origen permitido por CORS |
| `API_URL` | URL pública de la API (callbacks) |
| `RESEND_API_KEY` · `RESEND_FROM` · `ADMIN_EMAIL` | Envío de correo |
| `MP_ACCESS_TOKEN` · `MP_WEBHOOK_SECRET` | Credenciales MercadoPago |
| `META_PIXEL_ID` · `META_CAPI_ACCESS_TOKEN` | Conversions API de Meta (opcional; vacías la desactivan) |
| `META_CAPI_TEST_EVENT_CODE` | Solo mientras se prueban eventos en Events Manager |

---

## Scripts

```bash
pnpm start:dev     # desarrollo con recarga
pnpm build         # compilar a dist/
pnpm start:prod    # ejecutar build de producción
pnpm test          # pruebas unitarias + test de arquitectura + arranque del composition root
pnpm lint          # eslint --fix
pnpm lint:check    # eslint sin --fix; lo usa CI
pnpm test:int      # int-specs contra el Postgres local de .env.development.local
pnpm format        # prettier
```

---

## Despliegue de esta versión

Orden y verificaciones para publicar esta versión (auth con código y 2FA, pagos con alertas, RLS versionado):

Mergear a `main` despliega solo (Render), y el código nuevo necesita las columnas nuevas. Sigue este orden:

1. **Mergea el PR del frontend** y espera a que quede publicado. El front nuevo funciona con la API vieja.
2. **Verifica los emails duplicados** en el editor SQL de Supabase (solo lectura):
   ```sql
   select lower(trim(email)), count(*) from users group by 1 having count(*) > 1;
   ```
   Si devuelve filas, resuelve esos usuarios antes de seguir: si no, la migración `20261110000100_emails_minusculas` aborta.
3. **ANTES de mergear el PR de la API**, aplica las migraciones a producción en un momento tranquilo (`prisma migrate deploy` con el `DATABASE_URL` de producción, o confirma que el build command de Render lo corre antes del arranque). La API vieja es compatible con el esquema nuevo (las columnas nuevas tienen valores por defecto), pero el código nuevo falla sin ellas. La migración de RLS (`20261110000200_rls_versionado`) toma un `ACCESS EXCLUSIVE` breve por tabla.
4. **Mergea el PR de la API** (se despliega solo).
5. **Repite las dos consultas de verificación de RLS** (las mismas que corre `src/shared/infrastructure/prisma/rls.int-spec.ts`) y espera cero filas en ambas:
   ```sql
   -- tablas de public sin RLS
   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

   -- privilegios de anon/authenticated fuera de las dos vistas
   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
     AND NOT (table_name IN ('catalogo_publico', 'resenas_publicas') AND privilege_type = 'SELECT');
   ```
6. **Revoca las sesiones de admin abiertas antes del 2FA** (no tienen segundo factor detrás):
   ```sql
   delete from refresh_tokens where user_id in (select id from users where rol = 'ADMIN');
   ```
7. **Marca los productos que ya estaban ocultos a propósito.** El flag `oculto_por_admin` parte en `false`; si los alternas desde el panel, quedarían publicados un instante.
   ```sql
   update productos set oculto_por_admin = true where id in (...);
   ```
8. Los enlaces de restablecimiento de contraseña emitidos por la API anterior dejan de funcionar (impacto de 15 minutos como máximo).
9. **Comprobaciones manuales:** registro con código, login de admin con 2FA, restablecimiento de contraseña completo, una compra en el sandbox de MercadoPago con un primer intento rechazado y luego aprobado, y un reintento de webhook (fuerza un 500 una vez o revisa el panel "Reintentos" de MercadoPago) para confirmar que los reintentos se procesan.

---

## Licencia

MIT — ver [LICENSE](LICENSE).

Desarrollado por **Manuel Sebastián Cetre** · [GitHub](https://github.com/cetremore26) · cetremore@gmail.com
