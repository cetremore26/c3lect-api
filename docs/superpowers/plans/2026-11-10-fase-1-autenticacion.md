# Fase 1 — Autenticación y datos personales: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el acceso a cuentas y datos ajenos (OTP robusto, registro con email verificado, 2FA del admin, reset seguro, guards y pagos) y endurecer la superficie HTTP, sin romper el registro, el login ni el reset en el front.

**Architecture:** La API (NestJS, monolito modular Clean Architecture) amplía el contexto de identidad (`modules/auth`): reglas puras en `domain/`, nuevos métodos en `IdentityRepositoryPort` y un puerto `PURPOSE_TOKENS` para los JWT de propósito (`registro`, `admin-2fa`). Los guards de `shared/infrastructure/http/auth` dejan de confiar en el rol del token y lo releen por un puerto compartido `ROLE_READER` que implementa auth. El front (Vite/React) añade los pasos nuevos (2FA, registro con código, nueva contraseña) siendo compatible con la API vieja.

**Tech Stack:** NestJS 11, Prisma 6.19 + Postgres (Supabase), class-validator/class-transformer, @nestjs/jwt, @nestjs/throttler 6.5, argon2, Jest (API); React 18, react-router 7, axios, Vitest y ESLint (front).

**Spec:** `c3lect-api/docs/superpowers/specs/2026-11-10-correcciones-revision-design.md` (secciones 1.1–1.8, "Registro" de la Fase 4, "Despliegue y compatibilidad").

## Global Constraints

- Repos: API `d:\C3LECT\BOVEDA\c3lect-api`, front `d:\C3LECT\BOVEDA\boveda-c3lect-v2`; ambos en la rama `fix/correcciones-revision`. pnpm.
- Punto de partida: la Fase 0 ya está ejecutada. El front tiene Vitest (`pnpm test`) y ESLint (`pnpm lint`); `mensajeDeError(err: unknown, fallback: string): string` vive en `src/app/api/common.ts`. La API tiene el script `lint:check`.
- Antes de cada commit en la API: `pnpm exec tsc --noEmit`, `pnpm lint:check` y `pnpm test` en verde (incluye `src/architecture.spec.ts`). En el front: `pnpm typecheck`, `pnpm lint` y `pnpm test`.
- Int-specs: `INTEGRATION_DATABASE_URL=postgresql://c3lect:c3lect@localhost:5433/c3lect_dev pnpm test:int`, con las migraciones aplicadas antes (`DATABASE_URL=<la misma> pnpm exec prisma migrate deploy`). Sin la variable se saltan. Nunca contra producción.
- Las migraciones van en `prisma/migrations/<YYYYMMDDHHMMSS>_<nombre>/migration.sql`, escritas a mano y con `schema.prisma` actualizado. Lo que toque roles de Supabase va dentro de `DO $$ … IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') …` igual que `20261105000000_resenas`.
- Reglas de capas (ARCHITECTURE.md): `application` solo importa de `@nestjs/common` `Inject`, `Injectable` y `Logger`; nada de Prisma fuera de `infrastructure/persistence` del módulo dueño; `shared/` no toca delegados de Prisma (`.client.user.` en `shared/` rompe el test de arquitectura).
- Errores de negocio con `DomainError` (`BusinessRuleViolation` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409 y el nuevo `TooManyRequestsError` 429).
- Mensajes genéricos fijos: OTP y 2FA fallidos → `'Código inválido o expirado.'`; login → `'Credenciales incorrectas.'`; reset → `'Token inválido o expirado.'`; `request-otp` siempre responde `{ message: 'Si el correo está registrado, recibirás un código.' }`.
- Valores de la spec: código `crypto.randomInt(100000, 1000000)`; OTP vive 10 min; máx. 3 códigos por (email, propósito) en 15 min; máx. 5 intentos por código; `registrationToken` 15 min, `purpose: 'registro'`; `challengeToken` 10 min, `purpose: 'admin-2fa'`, `sub = userId`; secreto de reset 32 bytes, vida 15 min; `@ArrayMaxSize(20)`, `@Max(10)`, `@MaxLength(255)` en `fbp`/`fbc`; 5 pedidos por email por hora; `GET /users` `limit` ≤ 100.
- Compatibilidad: el front nuevo debe funcionar con la API vieja (sin `registrationToken`, sin `requiresSecondFactor`, enlaces `?token=`). Se despliega primero el front.
- Commits: conventional commits en español, sin líneas `Co-Authored-By` ni menciones a Claude.

## Review Focus

1. **Un `challengeToken` o `registrationToken` usado como `Authorization: Bearer`.** Están firmados con el mismo `JWT_SECRET` que el access token y el `challengeToken` lleva `sub = adminId`; con `RolesGuard` releyendo el rol de la base daría acceso de admin sin segundo factor. `JwtStrategy.validate` debe rechazar cualquier payload con `purpose` (test en la Tarea 7).
2. **Un token de un propósito presentado en otro sitio** (`challengeToken` como `registrationToken`, access token como cualquiera de los dos) → 401 (test en la Tarea 3).
3. **Email con mayúsculas o espacios** (`" Ana@Mail.com "` al pedir el código y `"ana@mail.com"` al verificarlo, registrarse o comprar como invitado) → el mismo email (tests de DTO en la Tarea 4).
4. **Un código anterior, tras pedir otro**, o un código `LOGIN` enviado a `/auth/login/2fa` → 401 genérico (tests en las Tareas 2 y 5).
5. **Enlace de reset mal formado o del formato viejo** (`?token=<hex>` sin punto, o un `id` inexistente) → 401, nunca 500; y un 401 de `verify-otp` o `reset-password` en el front no debe mandar al usuario a `/login` (tests en las Tareas 6 y 13).

---

## Mapa de archivos

**API — `c3lect-api/`**

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` | `enum PropositoOtp`, `OtpCode.intentos`, `OtpCode.proposito` |
| `prisma/migrations/20261110000000_otp_robusto/` | Columnas e índice de `otp_codes` |
| `prisma/migrations/20261110000100_emails_minusculas/` | `users.email` a minúsculas, aborta si colisiona |
| `prisma/migrations/20261110000200_rls_versionado/` | RLS y privilegios de `anon`/`authenticated` |
| `src/modules/auth/domain/otp-policy.ts` (nuevo) | `PropositoOtp`, constantes y `generarCodigoOtp()` |
| `src/modules/auth/domain/secret-token.ts` (nuevo) | Token de reset `<id>.<secreto>`, `hashDeSecreto`, `hashesIguales` |
| `src/modules/auth/application/ports/identity-repository.port.ts` | Métodos atómicos de OTP, refresh y reset |
| `src/modules/auth/application/ports/auth-services.port.ts` | Nuevo `PURPOSE_TOKENS` / `PurposeTokenPort` |
| `src/modules/auth/application/auth.service.ts` | Flujos 1.1–1.5 |
| `src/modules/auth/application/auth.service.spec.ts` (nuevo) | Tests de `AuthService` |
| `src/modules/auth/infrastructure/adapters/auth-services.adapters.ts` | `JwtPurposeTokens` |
| `src/modules/auth/infrastructure/adapters/prisma-role-reader.ts` (nuevo) | Implementa `ROLE_READER` |
| `src/modules/auth/infrastructure/persistence/prisma-identity.repository.ts` | Implementación del puerto |
| `src/modules/auth/infrastructure/persistence/*.int-spec.ts` (nuevos) | Consumo atómico y migración de emails |
| `src/modules/auth/infrastructure/http/auth.controller.ts` + `dto/` | `login/2fa`, `registrationToken`, normalización |
| `src/modules/auth/infrastructure/http/jwt.strategy.ts` | Rechaza tokens de propósito |
| `src/modules/auth/auth.module.ts` | `@Global()`, exporta `ROLE_READER` |
| `src/shared/application/ports/role-reader.port.ts` (nuevo) | `ROLE_READER` / `RoleReaderPort` |
| `src/shared/infrastructure/http/auth/optional-jwt-auth.guard.ts`, `roles.guard.ts` | 1.5 |
| `src/shared/infrastructure/http/dto/normalize-email.transform.ts` (nuevo) | `@NormalizeEmail()` |
| `src/shared/domain/domain-error.ts`, `src/shared/infrastructure/http/filters/global-exception.filter.ts` | `TooManyRequestsError` → 429 |
| `src/shared/infrastructure/prisma/rls.int-spec.ts` (nuevo) | Verifica RLS y privilegios |
| `src/config/throttler.ts`, `src/config/swagger.ts` (nuevos) | Opciones del throttler y regla de Swagger |
| `src/app.module.ts`, `src/main.ts` | Usan los dos anteriores |
| `src/modules/payments/...` | 1.6 |
| `src/modules/orders/...` | Límites de `POST /orders`, `linkGuestOrders` sin mayúsculas |
| `src/modules/users/application/users.service.ts` | `limit` ≤ 100 |
| `src/modules/notifications/infrastructure/mail/mail.service.ts` | `escapeHtml(detalle)` |

**Front — `boveda-c3lect-v2/src/app/`**

| Archivo | Responsabilidad |
|---|---|
| `api/auth.ts` | Tipos y llamadas nuevas (`loginSegundoFactor`, `restablecerContrasena`, `registrationToken`) |
| `api/client.ts` | `esEndpointDeAuth(url)`: endpoints cuyo 401 no dispara refresh |
| `context/AuthContext.tsx` | `login` con desafío, `completarSegundoFactor`, `register` con token, `restablecerContrasena` |
| `lib/autenticacion.ts` (nuevo) | `leerEstadoRegistro(state)` |
| `lib/resetToken.ts` (nuevo) | Lectura y limpieza del token de reset |
| `lib/contrasena.ts` (nuevo) | `validarNuevaContrasena` |
| `lib/metaPixel.ts` | `esRutaExcluida(pathname?)` con `/reset-password`; `trackPageView` la respeta |
| `main.tsx` (en `src/`) | `capturarTokenDeReset()` antes de `initMetaPixel()` |
| `pages/Login.tsx`, `pages/Register.tsx`, `pages/ResetPassword.tsx` | Flujos de UI |

---

## Task 1 (API): OTP en la base: esquema, migración y repositorio atómico

**Files:**
- Modify: `prisma/schema.prisma:105-114` (modelo `OtpCode`)
- Create: `prisma/migrations/20261110000000_otp_robusto/migration.sql`
- Create: `src/modules/auth/domain/otp-policy.ts`, `src/modules/auth/domain/otp-policy.spec.ts`
- Modify: `src/modules/auth/application/ports/identity-repository.port.ts`
- Modify: `src/modules/auth/infrastructure/persistence/prisma-identity.repository.ts`
- Test: `src/modules/auth/infrastructure/persistence/prisma-identity.repository.int-spec.ts`

**Interfaces:**
- Produces (domain, `otp-policy.ts`):
  ```ts
  export const PropositoOtp = { LOGIN: 'LOGIN', ADMIN_2FA: 'ADMIN_2FA' } as const;
  export type PropositoOtp = (typeof PropositoOtp)[keyof typeof PropositoOtp];
  export const OTP_VIGENCIA_MS = 10 * 60 * 1000;
  export const OTP_VENTANA_MS = 15 * 60 * 1000;
  export const OTP_MAX_POR_VENTANA = 3;
  export const OTP_MAX_INTENTOS = 5;
  export function generarCodigoOtp(): string; // String(randomInt(100000, 1000000))
  ```
- Produces (puerto; reemplaza `saveOtp`, `findValidOtps`, `markOtpUsed`):
  ```ts
  export interface OtpVivo { id: string; hash: string; intentos: number }
  countOtpsSince(email: string, proposito: PropositoOtp, desde: Date): Promise<number>;
  invalidateOtps(email: string, proposito: PropositoOtp): Promise<void>;   // used = true a los no usados
  saveOtp(data: { email: string; proposito: PropositoOtp; codeHash: string; expiresAt: Date }): Promise<void>;
  findLiveOtp(email: string, proposito: PropositoOtp): Promise<OtpVivo | null>; // used=false, vigente, el más reciente
  registerFailedOtpAttempt(id: string, maxIntentos: number): Promise<void>; // intentos+1; al llegar a max, used=true
  consumeOtp(id: string): Promise<boolean>; // updateMany({ where: { id, used: false } }) → count === 1
  ```
  El puerto importa `PropositoOtp` como tipo desde `../../domain/otp-policy`.

- [ ] **Step 1: Escribir los tests que fallan**

`otp-policy.spec.ts`:
```ts
it('genera códigos de 6 dígitos sin ceros a la izquierda', () => {
  for (let i = 0; i < 500; i++) {
    const c = generarCodigoOtp();
    expect(c).toMatch(/^[1-9]\d{5}$/);
  }
});
```

`prisma-identity.repository.int-spec.ts` (mismo patrón `describeDb` que `catalogo-publico.int-spec.ts`; en `beforeAll` fija `process.env.DATABASE_URL = url`, crea `new PrismaService()`, `$connect()`, `new PrismaIdentityRepository(new PrismaTransactionHost(prisma))`; email único por corrida `otp-${randomUUID()}@test.local`; `afterAll` borra las filas `otpCode` de ese email y desconecta):
```ts
it('consumeOtp concurrente: solo una llamada gana', async () => {
  await repo.saveOtp({ email, proposito: 'LOGIN', codeHash: 'h', expiresAt: enUnRato() });
  const { id } = (await repo.findLiveOtp(email, 'LOGIN'))!;
  const r = await Promise.all([repo.consumeOtp(id), repo.consumeOtp(id), repo.consumeOtp(id)]);
  expect(r.filter(Boolean)).toHaveLength(1);
  expect(await repo.findLiveOtp(email, 'LOGIN')).toBeNull();
});
it('el quinto intento fallido quema el código', async () => {
  // saveOtp + 4 × registerFailedOtpAttempt(id, 5) → findLiveOtp devuelve intentos 4
  // 1 × más → findLiveOtp(email, 'LOGIN') es null
});
it('invalidateOtps solo afecta al propósito indicado', async () => {
  // un LOGIN y un ADMIN_2FA vivos; invalidateOtps(email, 'LOGIN')
  // → findLiveOtp(LOGIN) null, findLiveOtp(ADMIN_2FA) no null
});
it('countOtpsSince cuenta filas emitidas desde la fecha, usadas o no', async () => {
  // tras los saveOtp anteriores, countOtpsSince(email, 'LOGIN', hace1Min) === nº de LOGIN creados
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm test -- otp-policy` → FAIL (módulo no existe). `pnpm test:int -- prisma-identity` → FAIL de compilación (`findLiveOtp` no existe).

- [ ] **Step 3: Implementar**

`schema.prisma`: `enum PropositoOtp { LOGIN ADMIN_2FA }`; en `OtpCode`: `intentos Int @default(0)`, `proposito PropositoOtp @default(LOGIN)`, `@@index([email, proposito, createdAt])`. `migration.sql`: `CREATE TYPE "PropositoOtp" AS ENUM ('LOGIN', 'ADMIN_2FA')`, `ALTER TABLE "otp_codes" ADD COLUMN "intentos" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "proposito" "PropositoOtp" NOT NULL DEFAULT 'LOGIN'`, y `CREATE INDEX "otp_codes_email_proposito_created_at_idx" ON "otp_codes"("email", "proposito", "created_at")`. Repositorio con los métodos del bloque Interfaces; `registerFailedOtpAttempt` hace `update` con `intentos: { increment: 1 }` y, si el valor devuelto es `>= maxIntentos`, `updateMany({ where: { id }, data: { used: true } })`. `AuthService` sigue compilando con un cambio mínimo provisional (la Tarea 2 lo reescribe): basta con que `requestOtp`/`verifyOtp` usen los métodos nuevos.

- [ ] **Step 4: Comprobar que pasan**

Run: `DATABASE_URL=<local> pnpm exec prisma migrate deploy`, luego `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <local-shadow> --exit-code` → sin diferencias. `pnpm test -- otp-policy` → PASS. `pnpm test:int -- prisma-identity` → PASS. `pnpm exec tsc --noEmit` → 0 errores.

- [ ] **Step 5: Commit**

```bash
git add prisma src/modules/auth
git commit -m "feat(auth): otp con intentos, propósito y consumo atómico en la base"
```

---

## Task 2 (API): OTP robusto en `AuthService` [S-A1, S-B6]

**Files:**
- Modify: `src/modules/auth/application/auth.service.ts` (`requestOtp`, `verifyOtp`, helpers privados)
- Create: `src/modules/auth/application/auth.service.spec.ts`

**Interfaces:**
- Consumes: Tarea 1 (puerto y `otp-policy`).
- Produces (privados, reutilizados por las Tareas 3 y 5):
  - `private emitirOtp(email: string, proposito: PropositoOtp): Promise<void>` — si `countOtpsSince(email, proposito, ahora − OTP_VENTANA_MS) >= OTP_MAX_POR_VENTANA` no hace nada; si no, dentro de `uow.run`: `invalidateOtps` → `saveOtp` (hash con `hasher.hash`, vence en `OTP_VIGENCIA_MS`) → `publish(new CodigoDeAccesoSolicitado({ email, codigo }))`.
  - `private verificarOtp(email: string, proposito: PropositoOtp, code: string): Promise<void>` — lanza `UnauthorizedError('Código inválido o expirado.')` si no hay vivo, si `hasher.verify` falla (antes llama `registerFailedOtpAttempt(id, OTP_MAX_INTENTOS)`) o si `consumeOtp(id)` devuelve `false`.

- [ ] **Step 1: Escribir los tests que fallan**

`auth.service.spec.ts` construye `new AuthService(identity, hasher, tokens, settings, fakeUnitOfWork(), events)` con `identity` = objeto de `jest.fn()` por método del puerto, `hasher = { hash: jest.fn(async (p) => 'H:' + p), verify: jest.fn(async (h, p) => h === 'H:' + p) }` y `events = fakeEventBus()` (de `src/shared/testing/fakes.ts`). La Tarea 3 añade un séptimo argumento al constructor; dejar el helper `makeService()` listo para crecer.

```ts
describe('requestOtp', () => {
  it('emite y publica un código cuando hay cupo', async () => {
    identity.countOtpsSince.mockResolvedValue(2);
    await service.requestOtp({ email: 'a@x.com' });
    expect(identity.invalidateOtps).toHaveBeenCalledWith('a@x.com', 'LOGIN');
    expect(identity.saveOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@x.com', proposito: 'LOGIN' }));
    expect(events.of(CodigoDeAccesoSolicitado)[0].solicitud.codigo).toMatch(/^\d{6}$/);
  });
  it('con 3 códigos en 15 min responde lo mismo y no emite', async () => {
    identity.countOtpsSince.mockResolvedValue(3);
    await expect(service.requestOtp({ email: 'a@x.com' }))
      .resolves.toEqual({ message: 'Si el correo está registrado, recibirás un código.' });
    expect(identity.saveOtp).not.toHaveBeenCalled();
    expect(events.published).toHaveLength(0);
  });
});
describe('verifyOtp', () => {
  it('compara solo contra el código vivo y lo consume', ...);          // hasher.verify llamado 1 vez; consumeOtp(id)
  it('código incorrecto suma un intento y responde 401', ...);       // registerFailedOtpAttempt('otp-1', 5); UnauthorizedError
  it('sin código vivo (p. ej. uno anterior ya invalidado) → 401', ...); // findLiveOtp → null
  it('si consumeOtp pierde la carrera → 401 y no emite tokens', ...); // consumeOtp → false; tokens.issue no llamado
  it('con cuenta existente devuelve tokens y usuario', ...);
});
```

- [ ] **Step 2: Comprobar que fallan** — Run: `pnpm test -- auth.service` → FAIL.
- [ ] **Step 3: Implementar** los dos helpers y reescribir `requestOtp`/`verifyOtp` sobre ellos (`proposito = PropositoOtp.LOGIN`). Desaparece `Math.random` y el bucle sobre N códigos. `verifyOtp` sin cuenta devuelve de momento `{ requiresRegistration: true }` (la Tarea 3 añade el token).
- [ ] **Step 4: Comprobar que pasan** — Run: `pnpm test -- auth.service` → PASS; `pnpm test` → todo verde.
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): un solo otp vivo, límite de solicitudes e intentos por código"`

---

## Task 3 (API): Registro con email verificado y tokens de propósito [S-A2, L-M8]

**Files:**
- Modify: `src/modules/auth/application/ports/auth-services.port.ts`
- Modify: `src/modules/auth/infrastructure/adapters/auth-services.adapters.ts`, `src/modules/auth/auth.module.ts`
- Modify: `src/modules/auth/application/auth.service.ts` (`RegisterCommand`, `register`, `verifyOtp`)
- Modify: `src/modules/auth/infrastructure/http/dto/register.dto.ts`, `auth.controller.ts` (`@Throttle({ auth: { limit: 8, ttl: 60000 } })` en `register`)
- Test: `auth.service.spec.ts`, `src/modules/auth/infrastructure/adapters/auth-services.adapters.spec.ts` (nuevo)

**Interfaces:**
- Produces:
  ```ts
  export const PURPOSE_TOKENS = Symbol('PURPOSE_TOKENS');
  export type PropositoToken = 'registro' | 'admin-2fa';
  export interface DatosDeProposito { sub?: string; email?: string }
  export interface PurposeTokenPort {
    firmar(proposito: PropositoToken, datos: DatosDeProposito, ttlSegundos: number): string;
    /** null si la firma, la expiración o el propósito no cuadran. */
    verificar(proposito: PropositoToken, token: string): DatosDeProposito | null;
  }
  export interface RegisterCommand { registrationToken?: string; email?: string; password: string; nombre: string; telefono?: string }
  ```
- `JwtPurposeTokens implements PurposeTokenPort` firma `{ purpose, ...datos }` con `JwtService.sign(payload, { expiresIn: ttlSegundos })` y verifica con `JwtService.verify` en `try/catch`, exigiendo `payload.purpose === proposito`.
- `verifyOtp` sin cuenta → `{ requiresRegistration: true, registrationToken }` con `firmar('registro', { email }, 15 * 60)`.
- `AuthService` recibe `@Inject(PURPOSE_TOKENS) purposeTokens: PurposeTokenPort` como séptimo parámetro, al final de la lista, para no reordenar los existentes.

- [ ] **Step 1: Escribir los tests que fallan**

Adaptador (con un `JwtService` real: `new JwtService({ secret: 's' })`):
```ts
it('verifica un token de su propio propósito', () => {
  const t = tokens.firmar('registro', { email: 'a@x.com' }, 60);
  expect(tokens.verificar('registro', t)).toEqual(expect.objectContaining({ email: 'a@x.com' }));
});
it('rechaza un token de otro propósito', () => {
  expect(tokens.verificar('registro', tokens.firmar('admin-2fa', { sub: 'u1' }, 60))).toBeNull();
});
it('rechaza un access token (sin purpose)', () => {
  expect(tokens.verificar('admin-2fa', jwt.sign({ sub: 'u1', rol: 'ADMIN' }))).toBeNull();
});
it('rechaza un token vencido', () => { /* ttl 1 s y jest.useFakeTimers / Date.now + 2 s, o firmar con exp pasado */ });
```
Servicio:
```ts
it('verifyOtp sin cuenta devuelve registrationToken de 15 min', async () => {
  // → { requiresRegistration: true, registrationToken: 'tok' }; purposeTokens.firmar('registro', { email: 'a@x.com' }, 900)
});
it('register sin token → 401', ...);                          // UnauthorizedError
it('register con token inválido → 401', ...);                 // verificar → null
it('register usa el email del token', ...);                   // createUser({ email: 'a@x.com', ... })
it('register con otro email en el body → 400', ...);          // BusinessRuleViolation
it('register publica UsuarioRegistrado (vincula pedidos)', ...);
```

- [ ] **Step 2: Comprobar que fallan** — Run: `pnpm test -- auth` → FAIL.
- [ ] **Step 3: Implementar.** `RegisterDto`: `registrationToken` con `@IsOptional() @IsString() @MaxLength(2000)` (opcional en validación para que la ausencia sea 401 en el servicio, como pide la spec, y no 400); `email` pasa a `@IsOptional()`. Mensajes: sin token o inválido → `UnauthorizedError('Verifica tu correo para crear la cuenta.')`; email distinto → `BusinessRuleViolation('El correo no coincide con el verificado.')`. Registrar `{ provide: PURPOSE_TOKENS, useClass: JwtPurposeTokens }` en `AuthModule`.
- [ ] **Step 4: Comprobar que pasan** — Run: `pnpm test -- auth` → PASS; `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): el registro exige un registrationToken del correo verificado"`

---

## Task 4 (API): Normalización de emails y login sin fuga de tiempos [L-M8, S-B4]

**Files:**
- Create: `src/shared/infrastructure/http/dto/normalize-email.transform.ts`, `normalize-email.transform.spec.ts`
- Modify: DTOs `login`, `register`, `request-otp`, `verify-otp`, `request-password-reset` (en `src/modules/auth/infrastructure/http/dto/`) y `src/modules/orders/infrastructure/http/dto/shipping-info.dto.ts`
- Modify: `src/modules/orders/infrastructure/persistence/prisma-order.repository.ts:181-186` (`linkGuestOrders`)
- Create: `prisma/migrations/20261110000100_emails_minusculas/migration.sql`
- Test: `src/modules/auth/infrastructure/persistence/emails-minusculas.int-spec.ts`
- Modify: `auth.service.ts` (`login`), test en `auth.service.spec.ts`

**Interfaces:**
- Produces: `export function NormalizeEmail(): PropertyDecorator` — `Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)`. Se coloca encima de `@IsEmail()` en cada DTO listado.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// normalize-email.transform.spec.ts
it.each([
  [LoginDto, { email: ' Ana@Mail.COM ', password: 'x' }],
  [RequestOtpDto, { email: ' Ana@Mail.COM ' }],
  [VerifyOtpDto, { email: ' Ana@Mail.COM ', code: '123456' }],
  [RequestPasswordResetDto, { email: ' Ana@Mail.COM ' }],
  [ShippingInfoDto, { email: ' Ana@Mail.COM ', nombreCompleto: 'A', telefono: '1', ciudad: 'B', departamento: 'C', direccion: 'D' }],
])('%p normaliza y valida el email', async (Dto, plain) => {
  const dto = plainToInstance(Dto, plain);
  expect(dto.email).toBe('ana@mail.com');
  expect(await validate(dto)).toEqual([]);
});
```
```ts
// auth.service.spec.ts
it('login con usuario inexistente ejecuta igual un argon2 y responde 401', async () => {
  identity.findUserByEmail.mockResolvedValue(null);
  await expect(service.login({ email: 'no@x.com', password: 'p' })).rejects.toThrow(UnauthorizedError);
  expect(hasher.verify).toHaveBeenCalledTimes(1);
});
```
`emails-minusculas.int-spec.ts` (pool `pg`, `BEGIN` … `ROLLBACK` por test; lee el SQL con `readFileSync(join(__dirname, '../../../../../prisma/migrations/20261110000100_emails_minusculas/migration.sql'))`; inserta en `users (id, email, nombre, updated_at)`):
```ts
it('aborta si dos emails colisionan sin mayúsculas', async () => {
  // inserta 'Dup@Test.local' y 'dup@test.local'
  await expect(db.query(sql)).rejects.toThrow(/duplicados/i);
});
it('pasa los emails a minúsculas y sin espacios', async () => {
  // inserta ' Mixto@Test.LOCAL'; tras el SQL, SELECT email → 'mixto@test.local'
});
```

- [ ] **Step 2: Comprobar que fallan** — `pnpm test -- normalize-email auth.service` → FAIL; `pnpm test:int -- emails-minusculas` → FAIL (archivo SQL no existe).
- [ ] **Step 3: Implementar.** Migración: bloque `DO $$` que, si `SELECT lower(trim(email)) FROM users GROUP BY 1 HAVING count(*) > 1` devuelve filas, hace `RAISE EXCEPTION 'Emails duplicados sin distinguir mayúsculas en users: %', <string_agg de los emails>`; si no, `UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email))`. `linkGuestOrders`: `shippingInfo: { email: { equals: email, mode: 'insensitive' } }`. `login`: si no hay usuario o no tiene `passwordHash`, `await this.hasher.verify(await this.hashFicticio(), cmd.password)` antes del 401; `private hashFicticio(): Promise<string>` memoiza en un campo `Promise<string> | null` el `hasher.hash(randomBytes(16).toString('hex'))`.
- [ ] **Step 4: Comprobar que pasan** — `pnpm test` → PASS; `prisma migrate deploy` local y `pnpm test:int -- emails-minusculas` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): emails normalizados en minúsculas y login con tiempo constante"`

---

## Task 5 (API): Segundo factor del admin

**Files:**
- Modify: `auth.service.ts` (`login`, nuevo `loginSecondFactor`, `verifyOtp`)
- Create: `src/modules/auth/infrastructure/http/dto/login-second-factor.dto.ts`
- Modify: `auth.controller.ts` (nueva ruta)
- Test: `auth.service.spec.ts`

**Interfaces:**
- Consumes: `emitirOtp`/`verificarOtp` (Tarea 2), `PurposeTokenPort` (Tarea 3).
- Produces:
  - `login(cmd)` con `rol === 'ADMIN'` y contraseña correcta → `emitirOtp(user.email, 'ADMIN_2FA')` y devuelve `{ requiresSecondFactor: true, challengeToken }` con `firmar('admin-2fa', { sub: user.id }, 10 * 60)`. No llama a `generateTokens`.
  - `loginSecondFactor(cmd: { challengeToken: string; code: string })` → `{ accessToken, refreshToken, user }`. Token inválido, usuario inexistente o no ADMIN, u OTP fallido → `UnauthorizedError('Código inválido o expirado.')`.
  - `verifyOtp` para un usuario ADMIN → el mismo 401 genérico (después de consumir el código).
  - `POST /auth/login/2fa` con `@HttpCode(HttpStatus.OK)` y `@Throttle({ auth: { limit: 8, ttl: 60000 } })`. `LoginSecondFactorDto { challengeToken: string (@IsString @IsNotEmpty @MaxLength(2000)); code: string (@IsString @Length(6, 6)) }`.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
it('login de ADMIN no devuelve tokens: emite OTP ADMIN_2FA y un challengeToken', async () => {
  // resultado toEqual({ requiresSecondFactor: true, challengeToken: 'chal' })
  // identity.saveOtp con proposito 'ADMIN_2FA'; purposeTokens.firmar('admin-2fa', { sub: 'admin-1' }, 600)
  // tokens.issue no llamado
});
it('login de CLIENTE sigue devolviendo tokens', ...);
it('loginSecondFactor con código correcto devuelve la sesión', ...);       // findLiveOtp('admin@x.com', 'ADMIN_2FA')
it('loginSecondFactor busca solo códigos ADMIN_2FA (un LOGIN no sirve)', ...); // findLiveOtp(…, 'ADMIN_2FA') → null ⇒ 401
it('loginSecondFactor con challengeToken inválido → 401', ...);
it('loginSecondFactor si el usuario ya no es ADMIN → 401', ...);
it('verifyOtp de un ADMIN responde el 401 genérico', ...);                // mensaje 'Código inválido o expirado.'
```
- [ ] **Step 2: Comprobar que fallan** — `pnpm test -- auth.service` → FAIL.
- [ ] **Step 3: Implementar** según Interfaces.
- [ ] **Step 4: Comprobar que pasan** — `pnpm test -- auth.service` → PASS; `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): segundo factor por correo para el admin"`

---

## Task 6 (API): Restablecer contraseña con token `<id>.<secreto>` [S-M4]

**Files:**
- Create: `src/modules/auth/domain/secret-token.ts`, `secret-token.spec.ts`
- Modify: puerto, repositorio, `auth.service.ts` (`requestPasswordReset`, `resetPassword`; el `sha256` local se sustituye por `hashDeSecreto`)
- Test: `auth.service.spec.ts`, `prisma-identity.repository.int-spec.ts`

**Interfaces:**
- Produces (domain):
  ```ts
  export function crearTokenDeReset(id: string, secreto: string): string;            // `${id}.${secreto}`
  export function parsearTokenDeReset(token: string): { id: string; secreto: string } | null; // corta en el primer '.', secreto /^[0-9a-f]{64}$/
  export function hashDeSecreto(secreto: string): string;                           // sha256 hex
  export function hashesIguales(a: string, b: string): boolean;                     // timingSafeEqual; false si difieren en longitud
  ```
- Produces (puerto; reemplaza `findValidPasswordResets` y `markPasswordResetUsed`):
  ```ts
  savePasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<{ id: string }>;
  invalidatePasswordResetsOf(userId: string): Promise<void>;
  findValidPasswordReset(id: string): Promise<(SecretoPendiente & { userId: string }) | null>;
  consumePasswordReset(id: string): Promise<boolean>; // updateMany where { id, used: false } → count === 1
  ```
- `requestPasswordReset`: en `uow.run`, `invalidatePasswordResetsOf` → `savePasswordReset(user.id, hashDeSecreto(secreto), +15 min)` → evento con `resetUrl = ${frontendUrl}/reset-password#token=${crearTokenDeReset(id, secreto)}`; `secreto = randomBytes(32).toString('hex')`.
- `resetPassword`: token no parseable, fila inexistente o hash distinto → `UnauthorizedError('Token inválido o expirado.')`; en `uow.run`: `consumePasswordReset(id)` (si `false` → mismo 401) → `updatePassword` → `deleteRefreshTokensOf`.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
// secret-token.spec.ts
it('ida y vuelta', () => expect(parsearTokenDeReset(crearTokenDeReset('id-1', 'a'.repeat(64)))).toEqual({ id: 'id-1', secreto: 'a'.repeat(64) }));
it.each(['', 'abc', 'a'.repeat(64), '.'+'a'.repeat(64), 'id.', 'id.zz'])('rechaza %p', (t) => expect(parsearTokenDeReset(t)).toBeNull());
it('hashesIguales', () => { expect(hashesIguales('ab', 'ab')).toBe(true); expect(hashesIguales('ab', 'abc')).toBe(false); });
```
```ts
// auth.service.spec.ts
it('requestPasswordReset invalida los anteriores y manda el enlace con fragmento', ...);
// resetUrl toMatch(/^http:\/\/front\/reset-password#token=reset-1\.[0-9a-f]{64}$/)
it('resetPassword con token del formato viejo (sin punto) → 401 sin consultar la base', ...);
it('resetPassword con secreto que no cuadra → 401', ...);
it('resetPassword consumido por otra petición → 401 y no cambia la contraseña', ...); // consumePasswordReset → false
it('resetPassword correcto cambia la contraseña y cierra sesiones', ...);
```
Int-spec (en el archivo de la Tarea 1; crea un usuario `reset-${uuid}@test.local` y lo borra en `afterAll`, cascada): `consumePasswordReset` concurrente → una sola `true`; `invalidatePasswordResetsOf` deja `findValidPasswordReset` en `null`.
- [ ] **Step 2: Comprobar que fallan** — `pnpm test -- secret-token auth.service` → FAIL.
- [ ] **Step 3: Implementar** según Interfaces.
- [ ] **Step 4: Comprobar que pasan** — `pnpm test` y `pnpm test:int -- prisma-identity` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): token de reset por id con comparación en tiempo constante y enlace con fragmento"`

---

## Task 7 (API): Sesión, tokens y guards [F-A1, S-B5, S-B6]

**Files:**
- Create: `src/shared/application/ports/role-reader.port.ts`
- Create: `src/modules/auth/infrastructure/adapters/prisma-role-reader.ts`
- Modify: `src/modules/auth/auth.module.ts` (`@Global()`, provider y `exports: [ROLE_READER]`)
- Modify: `src/shared/infrastructure/http/auth/roles.guard.ts`, `roles.guard.spec.ts`
- Modify: `src/shared/infrastructure/http/auth/optional-jwt-auth.guard.ts`; Create: `optional-jwt-auth.guard.spec.ts`
- Modify: `src/modules/auth/infrastructure/http/jwt.strategy.ts`; Create: `jwt.strategy.spec.ts`
- Modify: puerto/repositorio (`consumeRefreshToken` reemplaza `deleteRefreshToken`), `auth.service.ts` (`refreshTokens`)

**Interfaces:**
- Produces:
  ```ts
  // shared/application/ports/role-reader.port.ts
  export const ROLE_READER = Symbol('ROLE_READER');
  export interface RoleReaderPort { rolActual(userId: string): Promise<string | null> }
  // puerto de identidad
  consumeRefreshToken(id: string): Promise<boolean>; // deleteMany({ where: { id } }) → count === 1
  ```
- `PrismaRoleReader implements RoleReaderPort` lee `user.findUnique({ where: { id }, select: { rol: true } })` (vive en auth porque solo auth/users/account pueden tocar `user`).
- `RolesGuard(reflector, @Inject(ROLE_READER) roles)`: `canActivate` pasa a `async … Promise<boolean>`; sin roles requeridos → `true` sin consultar; con roles: sin `user` → `ForbiddenException`; `rol = await roles.rolActual(user.id)`; `null` o no incluido → `ForbiddenException('No tienes permiso para realizar esta acción.')`. El rol del token se ignora.
- `OptionalJwtAuthGuard`: `canActivate(ctx)` devuelve `true` sin pasar por passport si `request.headers.authorization` está ausente; si existe, `super.canActivate(ctx)`. `handleRequest(err, user)` lanza `err ?? new UnauthorizedException('Sesión inválida o expirada.')` cuando no hay usuario.
- `JwtStrategy.validate(payload)`: si `payload` trae `purpose` → `throw new UnauthorizedException()`. `JwtPayload` gana `purpose?: string`.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
// roles.guard.spec.ts (los 5 casos actuales pasan a async y reciben un RoleReader falso)
it('usa el rol de la base, no el del token', async () => {
  const guard = makeGuard(['ADMIN'], { rolActual: jest.fn().mockResolvedValue('CLIENTE') });
  await expect(guard.canActivate(makeContext({ id: 'u1', rol: 'ADMIN' }))).rejects.toThrow(ForbiddenException);
});
it('rechaza si el usuario ya no existe', ...);          // rolActual → null
it('no consulta la base si la ruta no declara roles', ...);
```
```ts
// optional-jwt-auth.guard.spec.ts
it('sin cabecera Authorization deja pasar como invitado', async () => {
  const superSpy = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate');
  expect(await guard.canActivate(ctxConHeaders({}))).toBe(true);
  expect(superSpy).not.toHaveBeenCalled();
});
it('con cabecera y token inválido responde 401', () => {
  expect(() => guard.handleRequest(null, false)).toThrow(UnauthorizedException);
});
it('con token válido devuelve el usuario', () => expect(guard.handleRequest(null, { id: 'u1' })).toEqual({ id: 'u1' }));
```
```ts
// jwt.strategy.spec.ts (new JwtStrategy({ getOrThrow: () => 's' } as unknown as ConfigService))
it('rechaza un challengeToken usado como access token', () => {
  expect(() => strategy.validate({ sub: 'admin-1', purpose: 'admin-2fa' } as never)).toThrow(UnauthorizedException);
});
it('acepta un access token normal', () => expect(strategy.validate({ sub: 'u', email: 'e', rol: 'CLIENTE' })).toEqual({ id: 'u', email: 'e', rol: 'CLIENTE' }));
```
```ts
// auth.service.spec.ts
it('refreshTokens: si otro request ya consumió el token → 401', ...); // consumeRefreshToken → false
```
Int-spec (archivo de la Tarea 1): `consumeRefreshToken` concurrente → una sola `true`.
- [ ] **Step 2: Comprobar que fallan** — `pnpm test -- roles.guard optional-jwt jwt.strategy auth.service` → FAIL.
- [ ] **Step 3: Implementar** según Interfaces.
- [ ] **Step 4: Comprobar que pasan** — `pnpm test` (incluido `architecture.spec`) y `pnpm test:int -- prisma-identity` → PASS. Arrancar `pnpm start:dev` con la base local y comprobar que levanta sin errores de inyección de `ROLE_READER` en los módulos que usan `RolesGuard`.
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): guard opcional responde 401 con token inválido, refresh atómico y rol releído de la base"`

---

## Task 8 (API): Acceso a pagos [S-M2, L-B3, S-B3]

**Files:**
- Modify: `src/modules/payments/application/ports/orders.port.ts` (`PedidoParaPago.userId: string | null`)
- Modify: `src/modules/payments/infrastructure/adapters/orders-facade.adapter.ts` (`toPedidoParaPago` copia `userId`)
- Modify: `src/modules/payments/application/use-cases/get-payment.use-case.ts` + spec
- Modify: `src/modules/payments/application/use-cases/create-payment.use-case.ts` + spec
- Modify: `src/modules/payments/infrastructure/http/payments.controller.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Solicitante { userId?: string; rol?: string }
  export interface PagoVisible { id: string; orderId: string | null; orderNumber: string; estado: EstadoPago; total: number; checkoutUrl: string | null; createdAt: Date; updatedAt: Date }
  GetPaymentUseCase(payments: PaymentRepositoryPort, @Inject(ORDERS) orders: OrdersPort).execute(orderId: string, quien: Solicitante): Promise<PagoVisible>
  CreatePaymentUseCase.execute(cmd: { orderId: string }, quien: Solicitante)
  ```
  `Solicitante` se declara en `get-payment.use-case.ts` y lo importa `create-payment.use-case.ts`.
- Regla común: `quien.rol === 'ADMIN' || (order.userId !== null && order.userId === quien.userId)`; si no → `ForbiddenError('No tienes permiso sobre este pedido.')`. Pedido inexistente → `NotFoundError('Pedido no encontrado.')`. En `create`, el pedido de invitado (sin `userId`) queda solo para ADMIN.
- Controller: `getPayment(@Param('orderId') orderId, @CurrentUser() user: { id: string; rol: string })` → `execute(orderId, { userId: user.id, rol: user.rol })`; `createPayment` pasa `{ userId: user?.id, rol: user?.rol }`.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
// get-payment.use-case.spec.ts
it('el dueño ve el pago sin draftPayload ni userId', async () => {
  // orders.findForPayment → { userId: 'u1', ... }; payments.findMostRecentByOrderId → pago completo con draftPayload y userId
  const r = await useCase.execute('order-1', { userId: 'u1', rol: 'CLIENTE' });
  expect(r).not.toHaveProperty('draftPayload'); expect(r).not.toHaveProperty('userId');
});
it('otro cliente → ForbiddenError', ...);
it('ADMIN ve cualquiera', ...);
it('pedido inexistente → NotFoundError', ...);
it('sin pago → NotFoundError', ...);
// create-payment.use-case.spec.ts
it('un cliente que no es dueño no crea preferencia → ForbiddenError', ...); // gateway.createPreference no llamado
it('un invitado no puede usar el flujo viejo → ForbiddenError', ...);
```
Los casos actuales de `create-payment.use-case.spec.ts` pasan a llamar `execute({ orderId }, { userId: 'user-1', rol: 'CLIENTE' })` con `orderBase.userId = 'user-1'`.
- [ ] **Step 2: Comprobar que fallan** — `pnpm test -- payment.use-case` → FAIL.
- [ ] **Step 3: Implementar** según Interfaces.
- [ ] **Step 4: Comprobar que pasan** — `pnpm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "fix(payments): solo el dueño o un admin consulta o crea pagos de un pedido"`

---

## Task 9 (API): RLS versionado [S-M1]

**Files:**
- Create: `prisma/migrations/20261110000200_rls_versionado/migration.sql`
- Test: `src/shared/infrastructure/prisma/rls.int-spec.ts`

**Interfaces:** ninguna de código. La migración:
1. Bucle `FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); END LOOP;` (sin guarda: funciona sin roles).
2. `DROP POLICY IF EXISTS "Lectura pública de productos" ON "public"."productos";` y lo mismo para `"Lectura pública de promociones"` en `"public"."promociones"`.
3. Por cada rol (`anon`, `authenticated`) dentro de `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = …)`: `EXECUTE format('REVOKE ALL ON public.%I FROM %I', t, rol)` para cada tabla de `pg_tables` de `public`; `REVOKE ALL` y `GRANT SELECT` sobre `catalogo_publico` y `resenas_publicas`; `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM <rol>`.
Idempotente: todo se puede reaplicar.

- [ ] **Step 1: Escribir el test que falla**
```ts
it('todas las tablas de public tienen RLS', async () => {
  const { rows } = await pool.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1`);
  expect(rows.map((r) => r.relname)).toEqual([]);
});
(hayRoles ? it : it.skip)('anon/authenticated solo tienen SELECT en las dos vistas', async () => {
  const { rows } = await pool.query(`SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
      AND NOT (table_name IN ('catalogo_publico', 'resenas_publicas') AND privilege_type = 'SELECT')`);
  expect(rows).toEqual([]);
});
```
`hayRoles` se calcula en `beforeAll` con `SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')` = 2.
- [ ] **Step 2: Comprobar que falla** — `pnpm test:int -- rls` antes de aplicar la migración → FAIL (tablas sin RLS en local).
- [ ] **Step 3: Escribir la migración** y aplicarla: `DATABASE_URL=<local> pnpm exec prisma migrate deploy`.
- [ ] **Step 4: Comprobar que pasa** — `pnpm test:int` (todas las int-specs) → PASS; aplicar la migración dos veces seguidas en una base de prueba con `psql -f` no da error.
- [ ] **Step 5: Commit** — `git commit -m "feat(db): rls y privilegios de supabase versionados en una migración"`
- [ ] **Step 6: Nota de despliegue** — Tras desplegar, el dueño repite en Supabase las dos consultas del test (tablas sin RLS y privilegios de `anon`/`authenticated`) y ambas deben devolver cero filas.

---

## Task 10 (API): Throttler, webhook y Swagger [S-M3, S-B7]

**Files:**
- Create: `src/config/throttler.ts`, `src/config/throttler.spec.ts`, `src/config/swagger.ts`, `src/config/swagger.spec.ts`
- Modify: `src/app.module.ts:35-40`, `src/main.ts:118-128`
- Modify: `src/modules/payments/infrastructure/http/payments.controller.ts:83` (`@SkipThrottle({ default: true, auth: true })`)

**Interfaces:**
- Produces:
  ```ts
  // src/config/throttler.ts
  export function declaraLimiteAuth(context: ExecutionContext): boolean; // lee 'THROTTLER:LIMITauth' del handler o la clase con Reflect.getMetadata
  export const throttlerOptions: ThrottlerModuleOptions; // default 300/60 s; auth 8/60 s con skipIf: (ctx) => !declaraLimiteAuth(ctx)
  // src/config/swagger.ts
  export function exponerSwagger(nodeEnv: string | undefined): boolean; // nodeEnv !== 'production'
  ```
  La clave `'THROTTLER:LIMIT' + 'auth'` se escribe literal con un comentario: `@nestjs/throttler` no exporta `THROTTLER_LIMIT` desde su índice.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
class Rutas {
  @Throttle({ auth: { limit: 8, ttl: 60000 } }) conAuth() {}
  sinAuth() {}
}
const ctx = (h: () => void) => ({ getHandler: () => h, getClass: () => Rutas }) as unknown as ExecutionContext;
it('aplica auth solo donde se declara', () => {
  expect(declaraLimiteAuth(ctx(Rutas.prototype.conAuth))).toBe(true);
  expect(declaraLimiteAuth(ctx(Rutas.prototype.sinAuth))).toBe(false);
});
it('Swagger solo fuera de producción', () => {
  expect(exponerSwagger('production')).toBe(false);
  expect(exponerSwagger('development')).toBe(true);
  expect(exponerSwagger(undefined)).toBe(true);
});
```
- [ ] **Step 2: Comprobar que fallan** — `pnpm test -- config/` → FAIL.
- [ ] **Step 3: Implementar**; `AppModule` usa `ThrottlerModule.forRoot(throttlerOptions)` (conservar el comentario sobre el cupo `default`); `main.ts` envuelve `DocumentBuilder`/`SwaggerModule.setup` en `if (exponerSwagger(config.get<string>('NODE_ENV')))`.
- [ ] **Step 4: Comprobar que pasan** — `pnpm test` → PASS; con `NODE_ENV=production pnpm start:prod` (tras `pnpm build`), `GET /api/docs` → 404.
- [ ] **Step 5: Commit** — `git commit -m "fix(http): throttle de auth solo en sus rutas, webhook sin throttle y swagger fuera de producción"`

---

## Task 11 (API): Límites de `POST /orders` [S-M7, L-B2]

**Files:**
- Modify: `src/shared/domain/domain-error.ts` (`TooManyRequestsError`), `src/shared/infrastructure/http/filters/global-exception.filter.ts`; Create: `global-exception.filter.spec.ts`
- Create: `src/modules/orders/domain/order-limits.ts`
- Modify: `create-order.dto.ts`, `order-item.dto.ts`; Create: `create-order.dto.spec.ts`
- Modify: `order-repository.port.ts`, `prisma-order.repository.ts`, `create-order.use-case.ts`; Create: `create-order.use-case.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export class TooManyRequestsError extends DomainError {} // → HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
  // orders/domain/order-limits.ts
  export const METODOS_SIN_PASARELA = [MetodoPago.TRANSFERENCIA, MetodoPago.CONTRAENTREGA, MetodoPago.NEQUI, MetodoPago.DAVIPLATA] as const;
  export const MAX_ITEMS_POR_PEDIDO = 20;
  export const MAX_CANTIDAD_POR_ITEM = 10;
  export const MAX_PEDIDOS_POR_EMAIL_POR_HORA = 5;
  // OrderRepositoryPort
  countByShippingEmailSince(email: string, desde: Date): Promise<number>; // shippingInfo.email insensitive, createdAt >= desde
  ```
- DTO: `metodoPago` con `@IsIn(METODOS_SIN_PASARELA)` en lugar de `@IsEnum(MetodoPago)`; `items` `@ArrayMaxSize(MAX_ITEMS_POR_PEDIDO)`; `OrderItemDto.cantidad` `@Max(MAX_CANTIDAD_POR_ITEM)`; `fbp`/`fbc` `@MaxLength(255)`.
- `CreateOrderUseCase.execute`: antes de cotizar, si `countByShippingEmailSince(email, ahora − 1 h) >= 5` → `TooManyRequestsError('Demasiados pedidos con este correo. Intenta de nuevo en una hora.')`.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
// create-order.dto.spec.ts (plainToInstance + validate, con un pedido base válido)
it.each([
  ['21 items', { items: Array(21).fill({ productId: 'p', cantidad: 1 }) }],
  ['cantidad 11', { items: [{ productId: 'p', cantidad: 11 }] }],
  ['fbp de 256', { fbp: 'x'.repeat(256) }],
  ['MERCADOPAGO', { metodoPago: 'MERCADOPAGO' }],
  ['TARJETA_CREDITO', { metodoPago: 'TARJETA_CREDITO' }],
])('rechaza %s', async (_, cambio) => expect(await validate(plainToInstance(CreateOrderDto, { ...base, ...cambio }))).not.toEqual([]));
it('acepta el pedido base con NEQUI', ...);
// create-order.use-case.spec.ts
it('el sexto pedido del mismo email en una hora → TooManyRequestsError y no crea', ...); // count → 5; orders.create no llamado
it('con 4 pedidos recientes crea el pedido', ...);
// global-exception.filter.spec.ts
it('TooManyRequestsError → 429', ...); // response.status llamado con 429
```
- [ ] **Step 2: Comprobar que fallan** — `pnpm test -- create-order global-exception` → FAIL.
- [ ] **Step 3: Implementar** según Interfaces.
- [ ] **Step 4: Comprobar que pasan** — `pnpm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "fix(orders): límites de tamaño, métodos sin pasarela y 5 pedidos por correo por hora"`

---

## Task 12 (API): `GET /users` acotado y alerta escapada [S-B8]

**Files:**
- Modify: `src/modules/users/application/users.service.ts` (`findAll`), `users.service.spec.ts`
- Modify: `src/modules/notifications/infrastructure/mail/mail.service.ts:285`; Create: `mail.service.spec.ts`

**Interfaces:** `UsersService.findAll(search?, page = 1, limit = 20)` usa `const take = Math.min(Math.max(limit, 1), 100)` para `skip`, `findAllPaginated` y `meta.limit`. `sendStockAlert` interpola `${escapeHtml(detalle)}`.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
it('limita limit a 100', async () => {
  repository.findAllPaginated.mockResolvedValue({ data: [], total: 0 });
  const r = await service.findAll(undefined, 1, 5000);
  expect(repository.findAllPaginated).toHaveBeenCalledWith({ search: undefined }, 0, 100);
  expect(r.meta.limit).toBe(100);
});
// mail.service.spec.ts: new MailService({ get: (k) => (k === 'RESEND_API_KEY' ? 're_test' : undefined) } as unknown as ConfigService),
// se sustituye (svc as unknown as { resend: unknown }).resend = { emails: { send } }
it('escapa el detalle de la alerta', async () => {
  await svc.sendStockAlert('a@x.com', 'C3L-1', '<img src=x onerror=alert(1)>');
  expect(send.mock.calls[0][0].html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});
```
- [ ] **Step 2: Comprobar que fallan** — `pnpm test -- users.service mail.service` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Comprobar que pasan** — `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint:check` → verde.
- [ ] **Step 5: Commit** — `git commit -m "fix: limit máximo en /users y detalle escapado en la alerta al admin"`

---

## Task 13 (front): Contrato de auth en `api/` y `AuthContext`

**Files:**
- Modify: `src/app/api/auth.ts`, `src/app/api/client.ts`, `src/app/context/AuthContext.tsx`
- Create: `src/app/lib/autenticacion.ts`
- Test: `src/app/api/client.test.ts`, `src/app/lib/autenticacion.test.ts`

**Interfaces:**
- Produces (`api/auth.ts`):
  ```ts
  export interface DesafioSegundoFactor { requiresSecondFactor: true; challengeToken: string }
  login(email, password): Promise<Sesion | DesafioSegundoFactor>
  loginSegundoFactor(challengeToken: string, code: string): Promise<Sesion>        // POST /auth/login/2fa
  verificarOtp(email, code): Promise<Partial<Sesion> & { requiresRegistration?: boolean; registrationToken?: string }>
  registrar(datos: { email: string; password: string; nombre: string; telefono?: string; registrationToken?: string }): Promise<Sesion>
  restablecerContrasena(token: string, newPassword: string): Promise<void>          // POST /auth/reset-password
  ```
- Produces (`api/client.ts`): `export function esEndpointDeAuth(url: string): boolean` — `true` para `/auth/login` (incluye `/auth/login/2fa`), `/auth/refresh`, `/auth/register`, `/auth/verify-otp`, `/auth/request-otp`, `/auth/reset-password`, `/auth/request-password-reset`. El interceptor usa esta función en lugar de `isAuthEndpoint`: un 401 de estos endpoints nunca dispara refresh ni `clearSessionAndRedirect`.
- Produces (`lib/autenticacion.ts`): `export interface EstadoRegistro { email: string; registrationToken?: string }` y `export function leerEstadoRegistro(state: unknown): EstadoRegistro | null` (exige `email` string no vacío; `registrationToken` solo si es string).
- Produces (`AuthContext`):
  ```ts
  login: (email: string, password: string) => Promise<{ challengeToken?: string }>;
  completarSegundoFactor: (challengeToken: string, code: string) => Promise<void>;
  loginConOtp: (email: string, code: string) => Promise<{ requiresRegistration?: boolean; registrationToken?: string }>;
  register: (email: string, password: string, nombre: string, telefono?: string, registrationToken?: string) => Promise<void>;
  restablecerContrasena: (token: string, newPassword: string) => Promise<void>;
  ```
  `login` guarda sesión solo si la respuesta trae `accessToken`; si trae `requiresSecondFactor` devuelve `{ challengeToken }`. Con la API vieja nunca llega el desafío.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
// client.test.ts
it.each(['/auth/login', '/auth/login/2fa', '/auth/verify-otp', '/auth/reset-password', '/auth/register'])('%s es de auth', (u) => expect(esEndpointDeAuth(u)).toBe(true));
it.each(['/orders', '/auth/me', '/payments/create-pending'])('%s no es de auth', (u) => expect(esEndpointDeAuth(u)).toBe(false));
// autenticacion.test.ts
it('lee email y token del state', () => expect(leerEstadoRegistro({ email: 'a@x.com', registrationToken: 't' })).toEqual({ email: 'a@x.com', registrationToken: 't' }));
it('acepta state sin token (API vieja)', () => expect(leerEstadoRegistro({ email: 'a@x.com' })).toEqual({ email: 'a@x.com' }));
it.each([null, undefined, 'x', {}, { email: '' }, { email: 3 }])('ignora %p', (s) => expect(leerEstadoRegistro(s)).toBeNull());
```
- [ ] **Step 2: Comprobar que fallan** — `pnpm exec vitest run src/app/api/client.test.ts src/app/lib/autenticacion.test.ts` → FAIL.
- [ ] **Step 3: Implementar** según Interfaces.
- [ ] **Step 4: Comprobar que pasan** — mismo comando → PASS; `pnpm typecheck` (las páginas siguen compilando: `Login` ignora el valor de retorno de `login` hasta la Tarea 14), `pnpm lint`.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): contrato de 2fa, registrationToken y reset en el cliente"`

---

## Task 14 (front): `Login.tsx` con segundo factor

**Files:**
- Modify: `src/app/pages/Login.tsx`

**Interfaces:**
- Consumes: `login`, `completarSegundoFactor`, `loginConOtp` (Tarea 13); `mensajeDeError` (Fase 0).
- `type Modo = 'password' | 'otp-request' | 'otp-verify' | 'segundo-factor'`; estado `challengeToken: string`.
- `handleLogin`: si `login` devuelve `challengeToken` → guarda y `setModo('segundo-factor')`; si no, navega a `destino`.
- Paso `segundo-factor`: texto "Te enviamos un código a tu correo"; campo de 6 dígitos igual al de `otp-verify`; envía `completarSegundoFactor(challengeToken, otpCode)` y navega a `destino`; botón "Reenviar código" que vuelve a llamar `login(email, password)` y actualiza `challengeToken`; error con `mensajeDeError(err, 'Código inválido o expirado')`. El título del `h1` es "Código de acceso" en los modos distintos de `password` (ya es así).
- `handleVerifyOtp` con `requiresRegistration`: `navigate(rutaDeAcceso(destino, '/register'), { replace: true, state: { email, registrationToken: result.registrationToken } })`.

- [ ] **Step 1: Implementar** (es UI; la lógica pura ya está cubierta en la Tarea 13).
- [ ] **Step 2: Verificar** — `pnpm typecheck`, `pnpm lint`, `pnpm test` → verde. Manual con `pnpm dev` contra la API nueva local: admin con contraseña → pide código → código correcto entra a `/admin`; código equivocado → mensaje y sigue en el paso. Contra la API vieja (rama `main` de la API): login de admin entra directo.
- [ ] **Step 3: Commit** — `git commit -m "feat(login): paso de código por correo para el admin"`

---

## Task 15 (front): `Register.tsx` en tres pasos

**Files:**
- Modify: `src/app/pages/Register.tsx`

**Interfaces:**
- Consumes: `requestOtp`, `loginConOtp`, `register` (Tarea 13), `leerEstadoRegistro` (Tarea 13), `useLocation` de `react-router`.
- `type Paso = 'email' | 'codigo' | 'formulario'`. Estado inicial: `const previo = leerEstadoRegistro(location.state)`; con `previo` → paso `formulario`, `email = previo.email`, `registrationToken = previo.registrationToken`; sin él → paso `email`.
- `email`: `requestOtp(email)` (errores ignorados, como en el login) → `codigo`.
- `codigo`: `loginConOtp(email, code)`; si `requiresRegistration` → guarda `registrationToken` (puede venir vacío con la API vieja) → `formulario`; si no (la cuenta ya existía y quedó iniciada) → `navigate(destino, { replace: true })`. Error: `mensajeDeError(err, 'Código inválido o expirado')`.
- `formulario`: el email se muestra de solo lectura; `register(email, password, nombre, telefono || undefined, registrationToken)`; se conservan `calcFuerza`, el Pixel (`setMetaUserData` + `trackCompleteRegistration` después del `await`) y la navegación a `destino`.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificar** — `pnpm typecheck`, `pnpm lint`, `pnpm test`. Manual contra la API nueva: `/register` → email → código → formulario → cuenta creada; entrar desde el login OTP con un email nuevo llega al formulario sin volver a pedir código. Contra la API vieja: el mismo recorrido crea la cuenta (sin token).
- [ ] **Step 3: Commit** — `git commit -m "feat(registro): verificar el correo con código antes del formulario"`

---

## Task 16 (front): Nueva contraseña desde el enlace y Pixel excluido [F-A2, F-M1, F-B3]

**Files:**
- Create: `src/app/lib/resetToken.ts`, `src/app/lib/resetToken.test.ts`
- Create: `src/app/lib/contrasena.ts`, `src/app/lib/contrasena.test.ts`
- Modify: `src/app/lib/metaPixel.ts` (`esRutaExcluida`, `trackPageView`); Create: `src/app/lib/metaPixel.test.ts`
- Modify: `src/main.tsx`, `src/app/pages/ResetPassword.tsx`

**Interfaces:**
- Produces:
  ```ts
  // lib/resetToken.ts
  export function extraerTokenDeReset(hash: string, search: string): string | null; // #token= primero; si no, ?token=; vacío → null
  export function capturarTokenDeReset(
    loc: Pick<Location, 'pathname' | 'hash' | 'search'> = window.location,
    hist: Pick<History, 'replaceState' | 'state'> = window.history,
  ): void; // solo en pathname que empieza por '/reset-password'; guarda el token en una variable del módulo y hace hist.replaceState(hist.state, '', loc.pathname)
  export function tokenDeResetCapturado(): string | null; // no lo borra (StrictMode monta dos veces)
  // lib/contrasena.ts
  export const PATRON_CONTRASENA: RegExp; // el mismo de RegisterDto/ResetPasswordDto en la API
  export function validarNuevaContrasena(nueva: string, confirmacion: string): string | null;
  // 'Las contraseñas no coinciden.' | 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial.' | null
  // lib/metaPixel.ts
  export function esRutaExcluida(pathname?: string): boolean; // por defecto window.location.pathname; '/admin' y '/reset-password'
  ```
- `main.tsx`: `capturarTokenDeReset()` justo antes de `initMetaPixel()`. `trackPageView` vuelve sin enviar si `esRutaExcluida()`.
- `ResetPassword.tsx`: `const token = tokenDeResetCapturado()`. Con token: formulario de nueva contraseña + confirmación, valida con `validarNuevaContrasena`, llama `restablecerContrasena(token, nueva)` y al terminar `navigate('/login', { replace: true })`; error con `mensajeDeError(err, 'El enlace no es válido o expiró. Pide uno nuevo.')` y enlace a `/reset-password` (sin token) para pedir otro. Sin token: el formulario de solicitud actual, con `catch` que muestra `mensajeDeError(err, 'No pudimos enviar el enlace. Intenta de nuevo.')` en un `FormError` en lugar de marcar `enviado`.

- [ ] **Step 1: Escribir los tests que fallan**
```ts
// resetToken.test.ts
it('prefiere el fragmento', () => expect(extraerTokenDeReset('#token=abc.def', '?token=viejo')).toBe('abc.def'));
it('acepta ?token= de la API vieja', () => expect(extraerTokenDeReset('', '?token=viejo')).toBe('viejo'));
it('sin token → null', () => expect(extraerTokenDeReset('', '')).toBeNull());
it('captura y limpia la URL en /reset-password', () => {
  const hist = { state: null, replaceState: vi.fn() };
  capturarTokenDeReset({ pathname: '/reset-password', hash: '#token=t1', search: '' }, hist);
  expect(hist.replaceState).toHaveBeenCalledWith(null, '', '/reset-password');
  expect(tokenDeResetCapturado()).toBe('t1');
});
it('no toca otras rutas', () => {
  const hist = { state: null, replaceState: vi.fn() };
  capturarTokenDeReset({ pathname: '/', hash: '#token=x', search: '' }, hist);
  expect(hist.replaceState).not.toHaveBeenCalled();
});
// contrasena.test.ts
it('no coinciden', () => expect(validarNuevaContrasena('Clave123!', 'Clave123?')).toBe('Las contraseñas no coinciden.'));
it('débil', () => expect(validarNuevaContrasena('clave', 'clave')).toMatch(/mínimo 8 caracteres/));
it('válida', () => expect(validarNuevaContrasena('Clave123!', 'Clave123!')).toBeNull());
// metaPixel.test.ts
it.each(['/admin', '/admin/ventas', '/reset-password'])('excluye %s', (p) => expect(esRutaExcluida(p)).toBe(true));
it.each(['/', '/product/1', '/login'])('no excluye %s', (p) => expect(esRutaExcluida(p)).toBe(false));
```
El test de captura importa el módulo con `vi.resetModules()` + `await import(...)` en un `beforeEach` para no arrastrar el token entre tests.
- [ ] **Step 2: Comprobar que fallan** — `pnpm exec vitest run src/app/lib` → FAIL.
- [ ] **Step 3: Implementar** según Interfaces.
- [ ] **Step 4: Comprobar que pasan** — `pnpm test`, `pnpm typecheck`, `pnpm lint` → verde. Manual: abrir `http://localhost:5173/reset-password#token=<id>.<secreto>` (generado con la API nueva local) → la barra de direcciones queda en `/reset-password` antes de pintar; con `VITE_META_PIXEL_ID` definido, en la pestaña Red no hay petición a `connect.facebook.net`; cambiar la contraseña redirige a `/login` y la nueva funciona. Con un enlace `?token=` de la API vieja, el cambio también funciona.
- [ ] **Step 5: Commit** — `git commit -m "feat(reset): nueva contraseña desde el enlace, url limpia y sin pixel"`

---

## Orden de despliegue (recordatorio de la spec)

1. Desplegar el front (Tareas 13–16): compatible con la API vieja.
2. Aplicar migraciones y desplegar la API (Tareas 1–12). Si `20261110000100_emails_minusculas` aborta por colisiones, resolver a mano esos usuarios y reintentar.
3. Los enlaces de reset emitidos por la API vieja dejan de valer (máx. 15 min de impacto).
4. Verificación manual: registro con código, login admin con 2FA, reset completo, consultas de RLS en Supabase.
