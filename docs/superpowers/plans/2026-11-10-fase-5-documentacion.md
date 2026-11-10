# Fase 5 — Documentación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `ARCHITECTURE.md` y los READMEs de ambos repos describan el sistema tal como queda después de las fases 1–4, y que el dominio de compras/ventas deje de llamar "Dto" a sus tipos de cambios.

**Architecture:** Fase de cierre: se ejecuta **al final**, cuando las fases 1–4 ya están integradas en `fix/correcciones-revision`. Una tarea de código (renombrar `CompraUpdateDto`/`VentaUpdateDto` a `…Cambios`) y el resto son ediciones de Markdown. Cada afirmación nueva en la documentación se contrasta con el código real antes de escribirla (nombres de eventos, rutas, variables).

**Tech Stack:** Markdown; NestJS/Jest (API) y Vite/React (front) solo para verificar.

**Spec:** `d:\C3LECT\BOVEDA\c3lect-api\docs\superpowers\specs\2026-11-10-correcciones-revision-design.md` (sección "Fase 5 — Documentación"; hallazgos [Q-A2], [Q-B4], [Q-F-B4]; contenido de las fases 1–4).

## Global Constraints

- Rama `fix/correcciones-revision` en ambos repos; esta fase corre después de las fases 1–4.
- "`ARCHITECTURE.md` reconoce el 'servicio de aplicación' como forma válida para CRUD simple y reserva `use-cases/` para flujos con transacción y eventos; documenta los eventos nuevos (`PagoDuplicado`, `PagoReembolsado`) y el flujo de auth."
- "Renombrar `CompraUpdateDto`/`VentaUpdateDto` del dominio a `…Cambios`."
- "READMEs de ambos repos al día (reseñas, cuenta, admin, registro con código, 2FA)."
- Documentación en español, mismo tono y formato (tablas, bloques de código) que los documentos actuales.
- Despliegue: "primero el front, luego la API" debe quedar escrito donde se documenta el despliegue.
- Los enlaces de reset de la API vieja (sin formato `<id>.<secreto>`) dejan de funcionar al desplegar: documentarlo en la nota de despliegue.
- Commits en español, estilo conventional commits, sin líneas `Co-Authored-By` ni menciones a Claude.
- `pnpm` puede no estar en el PATH; si es así usar `node_modules/.bin/<herramienta>`.

## Review Focus

1. Documentación que quedó **falsa** tras las fases: README API dice "El endpoint responde `200` de inmediato y procesa de forma asíncrona" (la Fase 2.1 lo hace síncrono y reintentable); `POST /auth/login` "emite tokens" (ADMIN ahora recibe `requiresSecondFactor`); `POST /auth/register` "con email y contraseña" (ahora exige `registrationToken`); `GET /payments/:orderId` "JWT" (ahora dueño o ADMIN); Swagger local siempre disponible (ya no en producción). Tarea 5 las busca con grep.
2. El front README afirma que el carrito guarda productos completos y que el reset usa `?token=`: tras las fases 4/1.4 guarda `{ id, cantidad }` y usa `#token=`. Tarea 6.
3. Quedan referencias a `CompraUpdateDto`/`VentaUpdateDto` en archivos que las fases 1–4 añadieron (specs, docs): Tarea 1 hace grep sobre todo el repo, no solo `src`.
4. Un ejemplo de `ARCHITECTURE.md` cita un evento o clase con nombre distinto al del código final: Tarea 7 comprueba cada nombre con grep.
5. Migraciones nuevas no mencionadas en el modelo de datos (`otp_codes.intentos/proposito`, `EstadoPago.REEMBOLSADO`, `orders.idempotency_key`, `ocultoPorAdmin`): Tarea 5.

## Estructura de archivos

API (`d:\C3LECT\BOVEDA\c3lect-api`):
- Modificar (código): `src/modules/compras/domain/compras.util.ts`, `src/modules/compras/application/compras.service.ts`, `src/modules/compras/infrastructure/http/dto/update-compra.dto.ts`, `src/modules/ventas/domain/ventas.util.ts`, `src/modules/ventas/application/ventas.service.ts`, `src/modules/ventas/infrastructure/http/dto/update-venta.dto.ts` y cualquier otro uso que hayan añadido las fases 1–4.
- Modificar (docs): `ARCHITECTURE.md`, `README.md`.

Front (`d:\C3LECT\BOVEDA\boveda-c3lect-v2`):
- Modificar (docs): `README.md`, `src/app/api/README.md`.

---

### Task 1: Renombrar `CompraUpdateDto` → `CompraCambios` y `VentaUpdateDto` → `VentaCambios`

**Files:**
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\src\modules\compras\domain\compras.util.ts` (interfaz en la línea ~17; uso en la línea ~47)
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\src\modules\compras\application\compras.service.ts` (import ~12, `update` ~78)
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\src\modules\compras\infrastructure\http\dto\update-compra.dto.ts` (import y `implements`)
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\src\modules\ventas\domain\ventas.util.ts` (interfaz ~45; uso ~82)
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\src\modules\ventas\application\ventas.service.ts` (import ~16, `update` ~104)
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\src\modules\ventas\infrastructure\http\dto\update-venta.dto.ts` (import y `implements`)

**Interfaces:**
- Produces: `export interface CompraCambios` (mismos campos que el `CompraUpdateDto` actual) en `compras.util.ts` y `export interface VentaCambios` (mismos campos) en `ventas.util.ts`. Las clases HTTP `UpdateCompraDto implements CompraCambios` y `UpdateVentaDto implements VentaCambios` conservan su nombre (siguen siendo DTOs de validación; el dominio no usa el sufijo Dto). Cambio puramente de nombre.

- [ ] **Step 1: Localizar todos los usos**

Run: `grep -rn "CompraUpdateDto\|VentaUpdateDto" . --include=*.ts --include=*.md --exclude-dir=node_modules --exclude-dir=dist`
Expected: los usos listados arriba más los que añadieron las fases 1–4 (incluidos specs). Anotarlos todos; el `docs/superpowers/specs` y `plans` no cuentan (los de esta fase mencionan el nombre viejo a propósito).

- [ ] **Step 2: Renombrar con el refactor del IDE o `sed` acotado** (`CompraUpdateDto`→`CompraCambios`, `VentaUpdateDto`→`VentaCambios`) en los archivos de `src/`. No tocar `UpdateCompraDto` ni `UpdateVentaDto`.

- [ ] **Step 3: Verificar que no queda ninguno**

Run: `grep -rn "CompraUpdateDto\|VentaUpdateDto" src`
Expected: sin resultados.

- [ ] **Step 4: Compilar y probar**

Run: `pnpm exec tsc --noEmit` — Expected: sin errores.
Run: `pnpm test` — Expected: PASS (incluye `src/architecture.spec.ts`).
Run: `pnpm lint:check` — Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "refactor(compras,ventas): renombrar CompraUpdateDto y VentaUpdateDto a Cambios"
```

### Task 2: ARCHITECTURE.md — el servicio de aplicación como forma válida

**Files:**
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\ARCHITECTURE.md` (sección "Las cuatro capas de un módulo", tabla de capas y "Cómo agregar algo")

**Interfaces:**
- Consumes: estado real de `src/modules/*/application/` (módulos con `*.service.ts`: account, audit, auth, compras, gastos, inventario, marcas, meta-conversions, notifications, precios, products, promotions; con `use-cases/`: orders y payments).
- Produces: subsección `### Casos de uso y servicios de aplicación` dentro de "Las cuatro capas de un módulo", citada por las tareas 3 y 7.

- [ ] **Step 1: Redactar la subsección** después de la tabla de capas y antes de la lista de `DomainError`, con este contenido decidido por la spec:
  - `application/` admite **dos formas**. **Servicio de aplicación** (`application/<nombre>.service.ts`, una clase `@Injectable` con varios métodos): forma válida para CRUD simple y consultas sin coordinación entre contextos (ejemplos reales: `compras.service.ts`, `gastos.service.ts`, `marcas.service.ts`). **Caso de uso** (`application/use-cases/<verbo>-<sustantivo>.use-case.ts`, una clase, un método): se reserva para flujos con **transacción y eventos** (ejemplos: `UpdateOrderStatusUseCase`, `HandleWebhookUseCase`).
  - Criterio de elección en una frase: si el flujo abre `uow.run` o publica eventos de dominio, es un caso de uso; si es leer/escribir tablas propias, un servicio.
  - Ambas formas siguen las mismas reglas de dependencia (solo puertos, sin Prisma). Los tipos de entrada del dominio se llaman `…Cambios`/`…Comando`, nunca `…Dto` (el sufijo Dto queda para `infrastructure/http/dto`); mencionar `CompraCambios` y `VentaCambios`.

- [ ] **Step 2: Actualizar "Cómo agregar algo"**: en "Un caso de uso nuevo en un módulo existente" añadir una oración que remita al criterio anterior (CRUD simple → método en el servicio; flujo transaccional → `use-cases/`).

- [ ] **Step 3: Verificar nombres citados**

Run: `ls src/modules/compras/application src/modules/orders/application/use-cases src/modules/payments/application/use-cases`
Expected: existen `compras.service.ts`, `update-order-status.use-case.ts` (o el nombre real) y `handle-webhook.use-case.ts`. Corregir en el documento cualquier nombre que difiera.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs(arquitectura): servicio de aplicación y casos de uso"
```

### Task 3: ARCHITECTURE.md — eventos de pagos y procesamiento del webhook

**Files:**
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\ARCHITECTURE.md` (sección "Eventos y transacciones"; mapa de eventos/bounded contexts si lista eventos de payments)

**Interfaces:**
- Consumes: eventos definidos en `src/modules/payments/domain/payment-events.ts` y exportados por `src/modules/payments/public-api.ts`; suscriptores en `src/modules/notifications/infrastructure/events/notifications.subscribers.ts` y `src/modules/meta-conversions/infrastructure/events/conversion-tracking.subscribers.ts`.
- Produces: subsección `### Pagos: eventos y webhook` bajo "Eventos y transacciones".

- [ ] **Step 1: Leer el código real** (`payment-events.ts`, `handle-webhook.use-case.ts`, suscriptores) y confirmar los nombres y la fase (`in-transaction`/`after-commit`) de cada evento: `PagoAprobado`, `PagoSinPedido`, `PagoDuplicado`, `PagoReembolsado`.

- [ ] **Step 2: Redactar la subsección** con una tabla `Evento | Cuándo se publica | Qué hace el suscriptor`:
  - `PagoAprobado`: pago aprobado y pedido materializado; correo + comprobante PDF (la generación del PDF corre en el handler `after-commit`; un fallo del PDF no impide el evento) + Meta.
  - `PagoSinPedido`: `approved` que no puede materializar pedido (flujo viejo con pedido ya no `PENDIENTE`, monto o moneda distintos a `payment.total`/`COP`, etc.); alerta al admin con el motivo.
  - `PagoDuplicado`: `approved` con `mpPaymentId` distinto sobre una fila ya `APROBADO` (doble cobro); alerta al admin para reembolsar. Nunca se descarta en silencio.
  - `PagoReembolsado`: transición `APROBADO → REEMBOLSADO` (`refunded` o `charged_back`); alerta al admin. No cancela el pedido automáticamente.
  Añadir los párrafos de reglas: estados terminales solo `APROBADO` y `REEMBOLSADO`; webhook procesado de forma síncrona (200 en éxito o irrelevante, 401 firma inválida o con más de 5 min de diferencia, 500 ante fallo inesperado para que MercadoPago reintente); `markProcessed`, creación del pedido y `linkToOrder` en una sola `uow.run`.

- [ ] **Step 3: Actualizar el diagrama/ejemplo** si menciona el webhook como asíncrono o lista eventos de pagos incompletos.

- [ ] **Step 4: Verificar nombres**

Run: `grep -rn "PagoAprobado\|PagoSinPedido\|PagoDuplicado\|PagoReembolsado" src --include=*.ts -l`
Expected: aparecen en `payment-events.ts`, `public-api.ts`, el caso de uso y los suscriptores. Si algún evento no existe con ese nombre, usar el nombre del código.

- [ ] **Step 5: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs(arquitectura): eventos de pagos y webhook reintentable"
```

### Task 4: ARCHITECTURE.md — flujo de autenticación y seguridad de base de datos

**Files:**
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\ARCHITECTURE.md` (nueva sección `## Autenticación y sesión` antes de "Cómo agregar algo"; nota en "Bounded contexts y dueños de tablas" sobre RLS)

**Interfaces:**
- Consumes: `src/modules/auth/application/auth.service.ts`, `src/modules/auth/infrastructure/http/*controller*.ts`, guards en `src/shared/infrastructure/` (`OptionalJwtAuthGuard`, `RolesGuard`), migración de RLS en `prisma/migrations/`.
- Produces: sección documentada que el README de la API enlaza en la Tarea 5.

- [ ] **Step 1: Contrastar con el código** rutas, nombres de campos y `purpose` de los JWT (`registro`, `admin-2fa`) en `AuthService` y el controller de auth.

- [ ] **Step 2: Redactar `## Autenticación y sesión`** con un diagrama de texto por flujo y estas reglas de la spec:
  - **Registro con email verificado:** `request-otp` → `verify-otp`; si el email no tiene cuenta responde `{ requiresRegistration: true, registrationToken }` (JWT `purpose: 'registro'`, email, 15 min); `register` exige `registrationToken`, el email sale del token y un email distinto en el body da 400; sin token válido 401. Todas las cuentas nacen verificadas; `linkGuestOrders` compara emails sin distinguir mayúsculas (los emails se normalizan a trim + minúsculas).
  - **OTP:** `crypto.randomInt`, un solo código vivo por (email, propósito `LOGIN | ADMIN_2FA`), máximo 3 emitidos por email en 15 min, 5 intentos por código antes de quemarlo, consumo atómico (`updateMany where used = false`, `count === 1`).
  - **Admin con segundo factor:** `login` con contraseña correcta y `rol = ADMIN` responde `{ requiresSecondFactor: true, challengeToken }` (JWT `purpose: 'admin-2fa'`, 10 min) y envía OTP `ADMIN_2FA`; `POST /auth/login/2fa { challengeToken, code }` entrega los tokens; `verify-otp` de un ADMIN responde el 401 genérico.
  - **Reset de contraseña:** token `<id>.<secreto>`, se guarda `sha256(secreto)`, comparación `timingSafeEqual`, pedir uno invalida los anteriores, enlace con fragmento `/reset-password#token=…`.
  - **Sesión:** `OptionalJwtAuthGuard` (cabecera presente e inválida → 401; invitado solo sin cabecera), refresh consumido de forma atómica, `RolesGuard` relee el rol del ADMIN en base en cada petición.

- [ ] **Step 3: Añadir `### Seguridad de la base de datos`** (en la sección de dueños de tablas): RLS habilitado en todas las tablas de `public`; `anon` y `authenticated` solo con `GRANT SELECT` sobre `catalogo_publico` y `resenas_publicas`; la migración es idempotente y protegida con `IF EXISTS (SELECT 1 FROM pg_roles …)`; las tablas futuras nacen cerradas por `ALTER DEFAULT PRIVILEGES`; el int-spec de RLS falla si una tabla queda sin RLS; **regla para quien añada una vista pública:** `REVOKE ALL` + `GRANT SELECT` explícito.

- [ ] **Step 4: Verificar**

Run: `grep -rn "requiresSecondFactor\|registrationToken\|admin-2fa" src --include=*.ts -l`
Expected: aparecen en auth. Corregir el texto si algún nombre difiere.

- [ ] **Step 5: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs(arquitectura): flujo de autenticación y seguridad de base de datos"
```

### Task 5: README de la API al día

**Files:**
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\README.md` (secciones "Decisiones de diseño que vale la pena mirar", "Módulos", "Endpoints principales", "Modelo de datos", "Puesta en marcha", "Scripts")

**Interfaces:**
- Consumes: Tareas 3 y 4 (enlaces a las secciones de `ARCHITECTURE.md`).

- [ ] **Step 1: Buscar lo que quedó falso**

Run: `grep -n "asíncrona\|de inmediato\|Swagger\|con email y contraseña\|emite tokens\|JWT.*Estado del pago" README.md`
Expected: las líneas a corregir (Review Focus 1).

- [ ] **Step 2: Endpoints — tabla `/auth`**: `register` "Registro con `registrationToken` (obtenido tras verificar el código)"; `login` "Login por contraseña; para ADMIN responde `requiresSecondFactor`"; añadir fila `POST /auth/login/2fa` ("Segundo factor del admin: `challengeToken` + código"); `verify-otp` "Verifica el código: emite tokens o, si no hay cuenta, `registrationToken`"; `reset-password` "token `<id>.<secreto>`". Tabla `/payments`: `GET /payments/:orderId` Auth "Dueño o ADMIN" con "respuesta reducida"; `POST /payments/create` "Dueño o ADMIN". Tabla `/orders`: `POST /orders` menciona `idempotencyKey` opcional y los límites (20 ítems, cantidad ≤ 10, 5 pedidos/hora por email, solo métodos sin pasarela). `GET /products` "sin ADMIN solo publicados y completos".

- [ ] **Step 3: Decisiones de diseño**: reescribir "Webhook a prueba de reintentos" (procesa **antes** de responder; 200 / 401 / 500 para reintento; idempotente; firma con `timingSafeEqual` y ventana de 5 min; verifica monto y moneda; doble cobro y reembolso generan alerta, ver ARCHITECTURE.md "Pagos: eventos y webhook"); ajustar "Respuestas que no filtran información" (límite por email además del throttling; argon2 ficticio para igualar tiempos) y "Autorización por rol" (2FA del admin y rol releído en base); añadir un párrafo "Registro con código y 2FA" que enlace a "Autenticación y sesión" en `ARCHITECTURE.md`.

- [ ] **Step 4: Módulos y modelo de datos**: fila Auth "Registro con código, login, 2FA del admin, OTP, refresh, reset, logout"; añadir en "Módulos" Reseñas (`/resenas`) si falta (verificar con `ls src/modules`). En "Modelo de datos" añadir `Resena` al árbol y anotar los campos nuevos: `OtpCode(intentos, proposito)`, `Order(idempotencyKey)`, producto con `ocultoPorAdmin`, enum `EstadoPago` con `REEMBOLSADO`.

- [ ] **Step 5: Puesta en marcha y scripts**: Swagger "disponible solo si `NODE_ENV !== 'production'`"; scripts: `pnpm lint:check` ("eslint sin `--fix`; lo usa CI"), `pnpm test:int` ("int-specs contra el Postgres local de `.env.development.local`"); sección o nota **Despliegue**: "primero el front, luego la API; los enlaces de reset emitidos antes del despliegue dejan de funcionar (máx. 15 minutos); la migración de emails a minúsculas aborta si hay colisiones y se resuelve a mano"; tras desplegar, repetir las dos consultas de verificación de RLS en Supabase.

- [ ] **Step 6: Verificar enlaces y nombres**

Run: `grep -n "ARCHITECTURE.md#" README.md` y comprobar que cada ancla existe como título en `ARCHITECTURE.md`.
Run: `grep -rn "login/2fa" src --include=*.ts -l` — Expected: el controller de auth. Ajustar rutas del README a las reales.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs(api): README al día con auth, pagos y despliegue"
```

### Task 6: READMEs del front al día

**Files:**
- Modify: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\README.md` (secciones "Funcionalidades", "Arquitectura", "Puesta en marcha", "Despliegue")
- Modify: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\api\README.md`

**Interfaces:**
- Consumes: rutas reales de `src/app/` (`pages/`, `admin/pages/`, `lib/`), scripts de `package.json` (`test`, `lint`, `typecheck`) de la Fase 0.

- [ ] **Step 1: Inventariar lo que existe**

Run: `ls src/app/pages src/app/admin/pages src/app/components/resenas` (en `d:\C3LECT\BOVEDA\boveda-c3lect-v2`)
Expected: páginas de cuenta, reseñas y secciones del panel admin para listar sin inventar.

- [ ] **Step 2: "Funcionalidades"** añadir viñetas: reseñas de productos (lectura pública desde `resenas_publicas`; escribir y moderar vía API); cuenta del cliente (perfil, direcciones, "Mis pedidos"); panel admin (productos con orden de destacados, ventas, compras, gastos, precios, pedidos, usuarios, auditoría, métricas); **registro con código** (email → código por correo → formulario de cuenta); **2FA del admin** (paso "código enviado a tu correo" tras la contraseña); recuperación de contraseña (enlace con `#token=`, pantalla de nueva contraseña, el Pixel no se carga en esa ruta).

- [ ] **Step 3: "Arquitectura" y "Puesta en marcha"**: nota de que el carrito guarda solo `{ id, cantidad }` y resuelve stock/precio contra el catálogo; el checkout no vacía el carrito antes de redirigir a MercadoPago (`pendingCheckout`, se vacía en `/checkout/success`). Scripts: `pnpm test` (Vitest), `pnpm lint` (ESLint), `pnpm typecheck` (tsc + reglas de arquitectura). "Despliegue": orden "primero el front, luego la API" y por qué (el front nuevo es compatible con la API vieja, no al revés).

- [ ] **Step 4: `src/app/api/README.md`**: añadir que `common.ts` contiene `params` y `mensajeDeError(err, fallback)` (única forma de leer el mensaje de un error de la API en páginas y hooks; no se usa `catch (err: any)`), y que `auth.ts` maneja `registrationToken` y `requiresSecondFactor` (verificar los nombres reales del archivo).

- [ ] **Step 5: Verificar que nada documentado es falso**

Run: `grep -rn "requiresSecondFactor\|registrationToken\|pendingCheckout" src/app -l` (en el repo del front)
Expected: aparecen en `api/auth.ts`/`Login.tsx`/`Register.tsx`/checkout. Ajustar el texto a los nombres reales.
Run: `pnpm typecheck` — Expected: sin errores (solo Markdown cambió; confirma que no se rompió nada).

- [ ] **Step 6: Commit**

```bash
git add README.md src/app/api/README.md
git commit -m "docs(front): README al día con registro con código, 2FA y cuenta"
```

### Task 7: Verificación final de coherencia

**Files:**
- Verificar (sin cambios esperados): `ARCHITECTURE.md`, `README.md` en ambos repos.

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: API sin restos del nombre viejo ni documentación contradictoria**

Run (en `c3lect-api`): `grep -rn "UpdateDto" ARCHITECTURE.md README.md src --include=*.md --include=*.ts | grep -v "UpdateCompraDto\|UpdateVentaDto\|UpdateOrderDto\|UpdateProductDto"`
Expected: sin resultados que mencionen `CompraUpdateDto`/`VentaUpdateDto`.
Run: `grep -n "de inmediato\|asíncrona" README.md` — Expected: sin la descripción antigua del webhook.

- [ ] **Step 2: Cada evento y ruta citados existen**: para cada nombre en las tablas nuevas (`PagoDuplicado`, `PagoReembolsado`, `PagoSinPedido`, `PagoAprobado`, `/auth/login/2fa`, `registrationToken`, `requiresSecondFactor`) correr `grep -rn "<nombre>" src` y confirmar que aparece.

- [ ] **Step 3: Gates de ambos repos**

Run (API): `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm lint:check` — Expected: todo en verde.
Run (front): `pnpm typecheck`, `pnpm test`, `pnpm lint` — Expected: todo en verde.

- [ ] **Step 4: Commit solo si hubo correcciones**

```bash
git add ARCHITECTURE.md README.md
git commit -m "docs: corregir referencias tras la verificación final"
```

---

## Autorrevisión

- **Cobertura de la spec (Fase 5):** servicio de aplicación y `use-cases/` (T2), eventos `PagoDuplicado`/`PagoReembolsado` (T3), flujo de auth (T4), renombre `…Cambios` con todos sus usos (T1), READMEs de ambos repos (T5, T6: reseñas, cuenta, admin, registro con código, 2FA), verificación (T7). Incluye también orden de despliegue, enlaces de reset viejos y RLS de la sección "Despliegue y compatibilidad".
- **Consistencia:** nombres `CompraCambios`/`VentaCambios`, `registrationToken`, `requiresSecondFactor`, `challengeToken`, `POST /auth/login/2fa`, `purpose: 'registro' | 'admin-2fa'` iguales en todas las tareas y alineados con la spec.
- **Dependencia de fases:** los nombres exactos de archivos y rutas de fases 1–4 los fijan esos planes; cada tarea contrasta con el código real (pasos de verificación con grep) en vez de asumirlos.
