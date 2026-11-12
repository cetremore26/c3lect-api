# Correcciones de la revisión completa (2026-11-10) — diseño

**Repos:** `c3lect-api` (NestJS) y `boveda-c3lect-v2` (Vite/React).
**Origen:** revisión completa del 2026-11-10 (seguridad API, lógica API, frontend, arquitectura). Cada requisito cita su hallazgo entre corchetes: `[S-A1]` seguridad API, `[L-C1]` lógica API, `[F-A1]` frontend, `[Q-A1]` arquitectura/calidad.
**Objetivo:** que nadie pueda entrar en cuentas ajenas ni ver datos de terceros, que ningún pago cobrado se pierda, que el stock y las ventas cuadren, y dejar una red de tests y lint que evite regresiones.

**Criterio de éxito global:** cada hallazgo en alcance tiene un test que falla antes del arreglo y pasa después (unit o int-spec en la API; Vitest en el front cuando la lógica es testeable fuera del DOM). Las suites existentes siguen en verde. Quien compra o entra con normalidad no nota cambios salvo los flujos nuevos descritos (registro con código, 2FA del admin, pantalla de nueva contraseña).

## Decisiones tomadas con el dueño

1. **Verificación de email: OTP antes del registro.** Registrarse exige verificar el email con un código; todas las cuentas nacen verificadas.
2. **Admin: contraseña + OTP como segundo factor.** El admin no puede entrar solo con OTP.
3. **Enfoque técnico: todo en Postgres** ampliando lo existente (sin Redis, sin Supabase Auth).
4. **Alcance: todo lo encontrado**, con las exclusiones razonadas de la sección "Fuera de alcance".

## Estado de producción verificado (2026-11-10)

RLS activo en todas las tablas internas salvo `resenas` (sin grants, no expuesta). `anon`/`authenticated` conservan todos los privilegios en 16 tablas internas, protegidas solo por RLS sin políticas activado a mano. Políticas de SELECT público sin efecto en `productos` y `promociones`. La API conecta como `postgres` (dueño; se salta RLS). El front solo lee `catalogo_publico` y `resenas_publicas`. **Hoy no hay exposición**; falta versionarlo.

---

## Fase 0 — Red de seguridad (antes de tocar lógica)

**API**
- Script `lint:check` (eslint sin `--fix`) para usar como gate; `lint` sigue igual. [Q-B2]
- `@typescript-eslint/no-floating-promises` pasa de `warn` a `error`; corregir lo que salga. [Q-B1]
- Alinear Prisma: `@prisma/adapter-pg` a la misma mayor que `@prisma/client` (6.19.x). No subir a Prisma 7. Verificar con tsc, tests y `test:int`. [Q-M1]

**Front**
- Vitest (con la config de Vite) y script `test`. ESLint flat config con `typescript-eslint`, `eslint-plugin-react-hooks` (`exhaustive-deps` como error) y `no-explicit-any`; script `lint`. Los errores existentes se corrigen o, si exigen rediseño, se desactivan por línea con comentario justificado. [Q-F-A1]
- Primeros tests de la lógica pura que las fases siguientes tocan: `lib/precio`, `lib/checkout`, reducer de `CartContext`, `admin/ventas/venta-form`, `lib/volver`.
- `mensajeDeError(err: unknown, fallback)` se mueve a `api/common.ts` y sustituye los 8 `catch (err: any)`. [Q-F-M3]

## Fase 1 — Autenticación y datos personales

### 1.1 OTP robusto [S-A1, S-B6]
- Código con `crypto.randomInt(100000, 1000000)`.
- `otp_codes` gana `intentos INT NOT NULL DEFAULT 0` y `proposito` (enum `LOGIN | ADMIN_2FA`, default `LOGIN`). El registro usa `LOGIN`: el código prueba la posesión del email, y `verify-otp` decide según exista o no la cuenta.
- **Un solo código vivo por (email, propósito):** al emitir uno nuevo, los anteriores sin usar se marcan `used = true` en la misma operación.
- **Límite de solicitudes por email:** como máximo 3 códigos emitidos por email en 15 minutos (contando filas). Por encima, la respuesta sigue siendo la genérica pero no se emite ni se envía código.
- **Límite de intentos por código:** cada verificación fallida incrementa `intentos`; al llegar a 5 el código se quema (`used = true`) y hay que pedir otro.
- **Consumo atómico:** el acierto se marca con `updateMany({ where: { id, used: false } })` y solo vale si `count === 1`.
- Solo se compara contra el único código vivo (desaparece el bucle de argon2 sobre N códigos).

### 1.2 Registro con email verificado [S-A2, L-M8, S-B4]
- `POST /auth/verify-otp` sin cuenta para ese email devuelve `{ requiresRegistration: true, registrationToken }`. `registrationToken` es un JWT firmado con `JWT_SECRET`, `purpose: 'registro'`, `email`, 15 minutos.
- `POST /auth/register` exige `registrationToken`. El email de la cuenta **sale del token**; si el body trae otro email, se rechaza (400). Sin token válido: 401.
- Como la cuenta nace verificada, la vinculación de pedidos de invitado (`UsuarioRegistrado` → `linkGuestOrders`) se mantiene.
- **Normalización de emails:** trim + minúsculas en todos los DTO de auth y en `shippingInfo.email` al crear pedidos. `linkGuestOrders` compara sin distinguir mayúsculas. Migración que pasa `users.email` a minúsculas, **abortando con error explícito** si dos usuarios colisionan (en ese caso se resuelve a mano antes de reintentar).
- Login por contraseña: si el usuario no existe se ejecuta un argon2 ficticio para igualar tiempos. [S-B4]
- Cuentas ya creadas sin verificar: no se tocan (decisión: sin acción retroactiva; ver riesgos).

### 1.3 Segundo factor del admin
- `POST /auth/login` con contraseña correcta y `rol = ADMIN` **no devuelve tokens**: emite un OTP `ADMIN_2FA` al email del admin y responde `{ requiresSecondFactor: true, challengeToken }` (JWT `purpose: 'admin-2fa'`, `sub = userId`, 10 minutos).
- Nuevo `POST /auth/login/2fa { challengeToken, code }` → tokens de sesión. Aplica el mismo límite de intentos y throttle `auth`.
- `POST /auth/verify-otp` para un usuario ADMIN responde el mismo 401 genérico que un código inválido (el admin no entra solo con OTP).
- Front: `Login.tsx` añade el paso "código enviado a tu correo" cuando recibe `requiresSecondFactor`.

### 1.4 Restablecer contraseña [S-M4, F-A2, F-M1, F-B3]
- El token pasa a `<id>.<secreto>` (secreto de 32 bytes). Se guarda `sha256(secreto)`, se busca por `id` y se compara con `timingSafeEqual`. Desaparece `findValidPasswordResets()` sin filtro.
- Pedir un reset invalida los anteriores sin usar de ese usuario. Consumo atómico (`updateMany where used = false`, `count === 1`).
- El enlace usa **fragmento**: `${frontendUrl}/reset-password#token=…` (el navegador no envía el fragmento a nadie).
- Front `ResetPassword.tsx`: si hay `#token=` (o `?token=`, para que el front nuevo funcione mientras siga desplegada la API vieja), lo lee, limpia la URL con `history.replaceState` **antes** de que corra el Pixel, muestra el formulario de nueva contraseña con confirmación y llama a `POST /auth/reset-password`; al terminar, redirige a `/login`. Sin token, el formulario de solicitud de siempre, con `catch` para errores.
- `metaPixel.esRutaExcluida()` excluye también `/reset-password` (carga inicial y `trackPageView`).

### 1.5 Sesión, tokens y guards [F-A1, S-B5, S-B6]
- `OptionalJwtAuthGuard`: si llega cabecera `Authorization` y el token es inválido o expiró → 401. Invitado solo cuando **no** hay cabecera. Así el interceptor del front renueva y reintenta.
- Refresh token consumido de forma atómica (`deleteMany where id`, `count === 1`).
- `RolesGuard` para `ADMIN` relee el rol del usuario en la base (una consulta por petición admin), para que un admin degradado pierda acceso de inmediato.

### 1.6 Acceso a pagos [S-M2, L-B3, S-B3]
- `GET /payments/:orderId`: misma regla que `GetOrderUseCase` (`ADMIN` o dueño del pedido; si no, 403) y DTO de salida reducido sin `draftPayload` ni `userId`.
- `POST /payments/create` (flujo viejo): solo el dueño del pedido o un ADMIN.

### 1.7 RLS versionado [S-M1]
Migración idempotente, protegida con `IF EXISTS (SELECT 1 FROM pg_roles …)` igual que `20261105000000_resenas`, para que funcione en el Postgres local sin roles de Supabase:
- `ENABLE ROW LEVEL SECURITY` en **todas** las tablas de `public` (incluida `resenas`).
- `REVOKE ALL` a `anon` y `authenticated` sobre todas las tablas internas; las vistas `catalogo_publico` y `resenas_publicas` conservan solo `GRANT SELECT`.
- `DROP POLICY IF EXISTS` de "Lectura pública de productos" y "Lectura pública de promociones".
- `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated` para que las tablas futuras nazcan cerradas.
- int-spec que falla si alguna tabla de `public` queda sin RLS o si `anon`/`authenticated` tienen privilegios fuera de las dos vistas (se salta si los roles no existen).
- Tras desplegar, el dueño repite las dos consultas de verificación en Supabase.

### 1.8 Endurecimiento HTTP [S-M3, S-M7, L-B2, S-B7, S-B8]
- Throttler: `auth` deja de aplicarse globalmente (solo en las rutas de auth que lo declaran); el webhook salta ambos (`@SkipThrottle({ default: true, auth: true })`).
- `POST /orders`: `@ArrayMaxSize(20)` en items, `@Max(10)` en `cantidad`, `@MaxLength(255)` en `fbp`/`fbc`; `metodoPago` limitado a los métodos sin pasarela (`TRANSFERENCIA`, `CONTRAENTREGA`, `NEQUI`, `DAVIPLATA`); como máximo 5 pedidos por `shippingInfo.email` por hora (contando filas) → 429.
- Swagger (`/api/docs`) solo si `NODE_ENV !== 'production'`.
- `GET /users`: `limit` con máximo 100.
- `escapeHtml` en `${detalle}` del correo de alerta al admin.

## Fase 2 — Pagos y webhook de MercadoPago

### 2.1 Procesamiento síncrono y reintentable [L-A1, L-M2]
- El controller procesa el webhook **antes** de responder. Éxito o notificación irrelevante → 200. Firma inválida → 401 (como hoy). **Fallo inesperado** (MP no responde, base caída) → 500 para que MercadoPago reintente.
- El caso de uso deja de tragarse errores: solo atrapa los casos de negocio esperados (que terminan en alerta) y deja propagar el resto.
- `markProcessed`, la creación del pedido y `linkToOrder` ocurren en **una sola** `uow.run`: un fallo deja el pago reprocesable por el reintento.
- La generación del PDF del comprobante pasa al handler `after-commit` de notificaciones; un fallo del PDF ya no impide publicar `PagoAprobado`.

### 2.2 Estados y pagos múltiples [L-C1, S-M5, L-A4, L-M1]
- Solo `APROBADO` y el nuevo `REEMBOLSADO` son terminales. `PENDIENTE | RECHAZADO | CANCELADO → APROBADO` está permitido.
- Llega un `approved` con un `mpPaymentId` distinto sobre una fila ya `APROBADO` (doble cobro) → evento `PagoDuplicado` → correo de alerta al admin para reembolsar. Nunca se descarta en silencio.
- Flujo viejo: si el pedido ya no está `PENDIENTE` y no fue confirmado por este mismo pago → `PagoSinPedido`. Un rechazo **no cancela** el pedido del flujo viejo (el cliente puede reintentar en la misma preferencia).
- `refunded` y `charged_back` → `REEMBOLSADO` (nueva variante de `EstadoPago`, migración incluida). `APROBADO → REEMBOLSADO` publica `PagoReembolsado` → correo de alerta al admin. **No** cancela el pedido automáticamente (el producto puede estar ya enviado; lo decide el admin).
- Regla general: ningún `approved` termina en `return` sin pedido o sin alerta. Un test por cada camino.

### 2.3 Firma y montos [S-B1, S-B2]
- Comparación de firma con `timingSafeEqual`; rechazo si `|ahora − ts| > 5 min`.
- Antes de materializar el pedido se comprueba `transaction_amount === payment.total` y `currency_id === 'COP'`; si no cuadra → `PagoSinPedido` con el motivo.

### 2.4 Stock verificado antes de cobrar [L-M3]
- La verificación previa de stock agrupa las líneas por fila de inventario (modelo resuelto) y suma cantidades. El DTO fusiona `productId` repetidos.

## Fase 3 — Pedidos, stock y ventas

- **Transiciones atómicas** [L-A2, S-M6]: `transitionStatus` hace `updateMany({ where: { id, status: anterior } })` dentro de la `uow.run`; `count === 0` → `ConflictError` (409). La lectura del estado ocurre dentro de la misma transacción.
- **Revertir lo realmente despachado** [L-M4]: la cancelación repone stock a partir de las ventas de plataforma (`historical_sales`) con ese `orderId` (modelo y cantidad), no re-resolviendo el catálogo actual.
- **Borrar venta de un pedido** [L-M5, Q-M2]: si la venta tiene `orderId` → `BusinessRuleViolation` ("cancela el pedido en su lugar"). Se elimina el TODO.
- **Revertir venta manual** [L-M6]: usa `buscarPorModelo` (insensible a mayúsculas) + incremento por id, igual que la salida.
- **Editar modelo de venta manual** [L-M7]: cambiar marca o modelo está prohibido (`BusinessRuleViolation`: "borra la venta y créala de nuevo"); el resto de campos sigue editable.
- **Ganancia entera** [L-A3]: `gananciaNeta` se redondea con `Math.round` en el dominio. Test con abono no proporcional.
- **Fechas de negocio en Bogotá** [L-B1]: día de negocio calculado en `America/Bogota` para la fecha de ventas de plataforma, los rangos de `list-orders` (offset `-05:00`) y la fecha del número de pedido.
- **Productos ocultos por el admin** [L-B4]: nuevo flag `ocultoPorAdmin` en productos; `StockRepuesto` solo rehabilita variantes que no estén ocultas por el admin. El panel lo fija al desactivar a mano.
- **Catálogo admin vs público** [hallazgo de la revisión del front sobre la API]: `GET /products` sin rol ADMIN solo devuelve productos publicados y completos.
- **Pedidos duplicados por reintento** [F-B1]: `POST /orders` acepta `idempotencyKey` (UUID, columna única en `orders`); repetir la clave devuelve el pedido ya creado.

## Fase 4 — Frontend

- **Checkout** [F-A1, F-M2, F-B7]: muestra el total devuelto por el backend en la confirmación. Con MercadoPago el carrito **no** se vacía antes de redirigir: se guarda `pendingCheckout` y se vacía en `/checkout/success`. Se valida que `checkoutUrl` no esté vacío y sea de un dominio de MercadoPago. `CheckoutResult` solo muestra número de pedido en `success` y corrige los textos de `failure`/`pending`. El checkout envía `idempotencyKey` generado al montar.
- **Sesión** [F-M3, F-B8]: `clearSessionAndRedirect` solo redirige en rutas protegidas (`/cuenta…`, `/admin…`, `/checkout`); en las públicas limpia la sesión y avisa a `AuthContext` (evento) para que `user = null`. Se elimina el fallback a `authUser` de `sessionStorage`. El carrito se vacía en logout.
- **Registro** (Fase 1.2): `/register` pide primero el email y el código; con `registrationToken` muestra el formulario. Desde el login OTP con `requiresRegistration`, el token viaja por `navigation state`.
- **Fechas del panel** [F-M4]: `hoyLocal()` en `lib/format.ts`, llamada al crear o resetear formularios de ventas, compras y gastos.
- **Carrito** [F-B4]: en `localStorage` solo `{ id, cantidad }`; stock y precio se resuelven contra `useProductos()`; ítems retirados o agotados se marcan y no pasan al checkout.
- **Varios** [F-B2, F-B5, F-B6, F-B9]: `?resenar=1` espera a `!auth.cargando`; "Mis pedidos" usa `useApiQuery`; `AdminProductos` con `try/catch`, mensaje y reversión, y `persistirOrden` fuera del updater; `destinoSeguro` valida con `new URL(valor, location.origin).origin === location.origin`.

## Fase 5 — Documentación

- `ARCHITECTURE.md` reconoce el "servicio de aplicación" como forma válida para CRUD simple y reserva `use-cases/` para flujos con transacción y eventos; documenta los eventos nuevos (`PagoDuplicado`, `PagoReembolsado`) y el flujo de auth. Renombrar `CompraUpdateDto`/`VentaUpdateDto` del dominio a `…Cambios`. [Q-A2]
- READMEs de ambos repos al día (reseñas, cuenta, admin, registro con código, 2FA). [Q-B4, Q-F-B4]

---

## Fuera de alcance (con motivo)

- **Turnstile/CAPTCHA en checkout** [S-M7]: requiere cuenta y claves de Cloudflare nuevas; los límites de 1.8 cubren el abuso más probable. Siguiente paso si aparece spam.
- **Purchase de Meta solo al confirmar** [S-M7]: cambia la atribución de campañas; es una decisión de marketing, no de seguridad.
- **Conciliación periódica de pagos PENDIENTE**: con el webhook reintentable (2.1) MercadoPago reintenta durante días; un cron añade infraestructura sin necesidad demostrada.
- **`forbidNonWhitelisted`** [S-B8]: `whitelist` ya descarta campos extra; activarlo puede romper clientes que mandan campos de más.
- **Refactor DDD (entidades ricas), dividir páginas gigantes, migración masiva al design system y a `useApiQuery`, convención ES/EN, tipado de auditoría, dividir `metrics.queries`, umbral de cobertura, Renovate** [Q-A3, Q-M4–M6, Q-F-M1, Q-F-M2, Q-F-M4, Q-B3, Q-F-B1–B3]: son mejoras de mantenibilidad sin defecto observable; se abordan cuando se toque cada zona.
- **Secretos de producción en el `.env` local** [S-B8]: higiene del equipo del dueño; se recomienda moverlos a `.env.development.local` con credenciales de desarrollo.

## Despliegue y compatibilidad

- **Orden: primero el front, luego la API.** El front nuevo es compatible con la API vieja (los campos extra como `registrationToken` o `idempotencyKey` se descartan por `whitelist`; `requiresSecondFactor` nunca llega). La API nueva rompería el registro y el login de admin con el front viejo.
- Las migraciones (`otp_codes`, `EstadoPago.REEMBOLSADO`, `orders.idempotency_key`, `ocultoPorAdmin`, emails en minúsculas, RLS) son aditivas salvo la normalización de emails, que aborta si hay colisiones.
- Los enlaces de reset emitidos por la API vieja no tienen formato `<id>.<secreto>`: **fallarán** en cuanto se despliegue la API nueva. Impacto: como mucho 15 minutos de enlaces; el usuario pide otro.

## Riesgos

- **Cuentas registradas antes del arreglo sin verificar** pudieron recibir pedidos de invitado ajenos. No se revierte nada automáticamente. Si se quiere auditar: pedidos con `user_id` no nulo cuyo `shipping_info.email` difiere en algo más que mayúsculas del email del usuario dueño.
- **2FA del admin depende del correo (Resend).** Si Resend cae, el admin no entra. Mitigación: el código vive 10 minutos y se puede pedir otro; no se añade puerta trasera.
- **`RolesGuard` con consulta a la base** añade una consulta por petición admin; aceptable con el tráfico actual.

## Pruebas

- API: unit tests de `AuthService` con los puertos existentes (hoy sin tests) cubriendo 1.1–1.5; unit tests del webhook por cada camino de 2.2; unit tests de transiciones y ventas de Fase 3; int-specs contra Postgres para RLS (1.7), consumo atómico, transición condicional y normalización de emails.
- Front: Vitest para la lógica pura (checkout, carrito, volver, hoyLocal, lectura del token del fragmento, exclusión del Pixel).
- Verificación manual tras desplegar: registro con código, login admin con 2FA, reset de contraseña completo, compra con MercadoPago en sandbox con un primer intento rechazado, consultas de RLS en Supabase.

## Planes de implementación

Un plan por fase, en orden 0 → 5. Las fases 1 y 4 tocan ambos repos; cada plan indica en qué repo va cada tarea. Ramas: `fix/correcciones-revision` en ambos repos.
