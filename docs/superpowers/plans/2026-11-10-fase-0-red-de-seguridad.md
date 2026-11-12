# Fase 0 — Red de seguridad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar ambos repos con gates automáticos (lint bloqueante en la API; Vitest y ESLint en el front) y con tests de la lógica pura que las fases 1–4 van a tocar, antes de cambiar comportamiento.

**Architecture:** No cambia comportamiento de producción. En la API se endurece ESLint (`no-floating-promises` a error, script `lint:check`, CI bloqueante) y se alinea `@prisma/adapter-pg` con `@prisma/client` 6.19.x. En el front se añade Vitest dentro de `vite.config.ts`, tests de funciones puras con el comportamiento actual (caracterización), un helper `mensajeDeError` en `api/common.ts` y ESLint flat config.

**Tech Stack:** NestJS 11, Prisma 6.19, Jest 30, ESLint 9 + typescript-eslint 8 (API); Vite 6.3.5, React 18, Vitest 3, ESLint 9, `typescript-eslint`, `eslint-plugin-react-hooks` 5 (front). Gestor: pnpm 10.

**Spec:** `d:\C3LECT\BOVEDA\c3lect-api\docs\superpowers\specs\2026-11-10-correcciones-revision-design.md` (sección "Fase 0 — Red de seguridad"; hallazgos [Q-B1], [Q-B2], [Q-M1], [Q-F-A1], [Q-F-M3]).

## Global Constraints

- Rama `fix/correcciones-revision` en ambos repos (`d:\C3LECT\BOVEDA\c3lect-api`, `d:\C3LECT\BOVEDA\boveda-c3lect-v2`).
- API: `@prisma/adapter-pg` a la misma mayor que `@prisma/client` (6.19.x). "No subir a Prisma 7".
- Verificar la API con `pnpm exec tsc --noEmit`, `pnpm test` y `pnpm test:int` (requiere el Postgres local de `.env.development.local`).
- `lint` sigue igual (con `--fix`); `lint:check` es eslint sin `--fix` y es el gate.
- Front: `mensajeDeError(err: unknown, fallback)` vive en `api/common.ts` y sustituye los 8 `catch (err: any)`.
- Front: ESLint con `typescript-eslint`, `eslint-plugin-react-hooks` (`exhaustive-deps` como error) y `no-explicit-any`; los errores existentes se corrigen o, si exigen rediseño, se desactivan por línea con comentario justificado.
- Tests del front sobre: `lib/precio`, `lib/checkout`, reducer de `CartContext`, `admin/ventas/venta-form`, `lib/volver`.
- Commits en español, estilo conventional commits, sin líneas `Co-Authored-By` ni menciones a Claude.
- `pnpm` puede no estar en el PATH de algunas shells; si es así usar `node_modules/.bin/<herramienta>` equivalente.
- `scripts/check-architecture.mjs` (front) verifica la ruta real `src/app`; `axios` solo puede importarse en `api/client.ts` (por eso `mensajeDeError` no importa axios).

## Review Focus

Entradas/fallos que la spec implica y que ninguna otra tarea ejercita; cada línea tiene su test en la tarea indicada.

1. `mensajeDeError` recibe un `message` que es **arreglo** (class-validator de Nest devuelve `string[]`): debe mostrarse unido, no `[object Object]` ni el fallback (Tarea 4).
2. `mensajeDeError` recibe `undefined`, `null`, un string o un `Error` sin `response`: devuelve el `fallback`, nunca lanza (Tarea 4).
3. `destinoSeguro` con `//evil.com`, `/\evil.com`, `https://evil.com`, vacío y `/login?x=1`: siempre `/catalog` (Tarea 5).
4. Carrito: `ADD` con `stock = 0` no añade ítem; `UPDATE_QTY` con 0 lo elimina; cantidad no supera `stock` (Tarea 7).
5. `recalcEstado` con `precioVenta` vacío o 0 no cambia el estado; `abono >= precioVenta` cierra en `Pagado` (Tarea 7).
6. Un `Promise` sin await en código nuevo rompe `lint:check` (Tarea 1, paso de prueba negativa).

## Estructura de archivos

API (`d:\C3LECT\BOVEDA\c3lect-api`):
- Modificar `package.json` (script `lint:check`; versión de `@prisma/adapter-pg`), `eslint.config.mjs` (regla), `.github/workflows/ci.yml` (lint bloqueante), `pnpm-lock.yaml`.

Front (`d:\C3LECT\BOVEDA\boveda-c3lect-v2`):
- Modificar `package.json`, `vite.config.ts`, `src/app/api/common.ts`, `src/app/context/CartContext.tsx` (solo exportar el reducer), los 6 archivos con `catch (err: any)`.
- Crear `eslint.config.js`, `src/app/api/common.test.ts`, `src/app/lib/precio.test.ts`, `src/app/lib/volver.test.ts`, `src/app/lib/checkout.test.ts`, `src/app/context/cartReducer.test.ts`, `src/app/admin/ventas/venta-form.test.ts`.

---

## Parte A — API (repo `c3lect-api`)

### Task 1: ESLint como gate (`lint:check`, `no-floating-promises` en error, CI bloqueante)

**Files:**
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\package.json` (scripts)
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\eslint.config.mjs` (regla `@typescript-eslint/no-floating-promises`)
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\.github\workflows\ci.yml` (paso de lint)

**Interfaces:**
- Produces: script `pnpm lint:check` (exit 0 = limpio) que las fases 1–4 usan como gate.

Estado verificado: con la configuración actual `eslint "{src,apps,libs}/**/*.ts"` no emite ningún aviso, así que subir la regla a `error` no debería exigir correcciones de código; el paso 3 lo confirma.

- [ ] **Step 1: Añadir el script `lint:check`** en `package.json`, junto a `lint`: `"lint:check": "eslint \"{src,apps,libs}/**/*.ts\""`. No tocar `lint`.

- [ ] **Step 2: Cambiar la regla a error** en `eslint.config.mjs`: `'@typescript-eslint/no-floating-promises': 'error'`.

- [ ] **Step 3: Verificar que el código actual pasa**

Run: `pnpm lint:check`
Expected: sin salida y exit 0. Si aparece algún `no-floating-promises`, corregirlo con `await`, `void` (solo si es intencional y se explica en un comentario) o `.catch(...)`; no desactivar la regla.

- [ ] **Step 4: Prueba negativa** (archivo temporal, no se commitea)

Crear `src/shared/tmp-floating.ts` con `export function f() { Promise.resolve(1); }`.
Run: `pnpm lint:check`
Expected: FAIL con `@typescript-eslint/no-floating-promises` en ese archivo. Borrar el archivo y repetir `pnpm lint:check` hasta exit 0.

- [ ] **Step 5: Hacer bloqueante el lint en CI**: en `.github/workflows/ci.yml` reemplazar el paso "Lint (no bloqueante)" por un paso "Lint" con `run: pnpm lint:check`, sin `continue-on-error` y sin el comentario "Informativo por ahora".

- [ ] **Step 6: Commit**

```bash
git add package.json eslint.config.mjs .github/workflows/ci.yml
git commit -m "chore(lint): lint:check como gate y no-floating-promises en error"
```

### Task 2: Alinear `@prisma/adapter-pg` con `@prisma/client` 6.19.x

**Files:**
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\package.json` (`dependencies["@prisma/adapter-pg"]`)
- Modify: `d:\C3LECT\BOVEDA\c3lect-api\pnpm-lock.yaml` (lo regenera pnpm)
- Verificar sin cambios esperados: `src/shared/infrastructure/prisma/prisma.service.ts` (`new PrismaPg(pool)`)

**Interfaces:**
- Consumes: `PrismaService extends PrismaClient` usa `new PrismaPg(pool)` con `pg.Pool`.
- Produces: `@prisma/adapter-pg` 6.19.x instalado (hoy: adapter 7.8.0, client 6.19.3, prisma 6.19.3).

- [ ] **Step 1: Línea base**: con la versión actual correr `pnpm exec tsc --noEmit`, `pnpm test` y `pnpm test:int`; anotar que pasan (si `test:int` falla por la base local, levantar el Postgres de `.env.development.local` antes de seguir).

- [ ] **Step 2: Cambiar la versión** a `"@prisma/adapter-pg": "~6.19.3"` en `package.json` (tilde para no saltar de mayor por accidente) y ejecutar `pnpm install`.

- [ ] **Step 3: Verificar la versión instalada**

Run: `node -e "console.log(require('@prisma/adapter-pg/package.json').version, require('@prisma/client/package.json').version)"`
Expected: ambas `6.19.x`.

- [ ] **Step 4: Verificar compilación y suites**

Run: `pnpm exec tsc --noEmit` — Expected: sin errores.
Run: `pnpm test` — Expected: PASS (incluye `app.module.spec.ts`, que arranca el composition root).
Run: `pnpm test:int` — Expected: PASS contra el Postgres local.
Si `new PrismaPg(pool)` ya no compila con la API 6.x, adaptar `prisma.service.ts` a la firma de 6.19 (`new PrismaPg(pool)` o `new PrismaPg({ connectionString })`) manteniendo el mismo `Pool`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/shared/infrastructure/prisma/prisma.service.ts
git commit -m "chore(deps): alinear @prisma/adapter-pg con @prisma/client 6.19"
```

---

## Parte B — Front (repo `boveda-c3lect-v2`)

### Task 3: Vitest en el front

**Files:**
- Modify: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\package.json` (devDependency `vitest` `^3.2.4`; scripts `test`, `test:watch`)
- Modify: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\vite.config.ts` (bloque `test`)
- Create: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\lib\vitest-smoke.test.ts` (se borra al final de la tarea)

**Interfaces:**
- Produces: `pnpm test` (= `vitest run`) y `pnpm test:watch`. Convención: tests `src/**/*.test.ts`, entorno `node`, imports explícitos desde `vitest` (sin globals, para que `tsc --noEmit` no necesite tipos extra).

- [ ] **Step 1: Instalar**: `pnpm add -D vitest@^3.2.4` (compatible con Vite 6.3.5).

- [ ] **Step 2: Scripts** en `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Configurar** `vite.config.ts`: importar `defineConfig` desde `'vitest/config'` en vez de `'vite'` y añadir `test: { environment: 'node', include: ['src/**/*.test.ts'] }`. El alias `@` ya aplica a los tests.

- [ ] **Step 4: Test de humo** `src/app/lib/vitest-smoke.test.ts`: `import { it, expect } from 'vitest'; it('vitest corre', () => { expect(1 + 1).toBe(2); });`

- [ ] **Step 5: Verificar**

Run: `pnpm test` — Expected: 1 test PASS.
Run: `pnpm typecheck` — Expected: sin errores (tsc incluye `vite.config.ts` y los tests).
Run: `pnpm build` — Expected: build correcto (el bloque `test` no afecta al build).

- [ ] **Step 6: Borrar el test de humo y commit**

```bash
git rm -f src/app/lib/vitest-smoke.test.ts
git add package.json pnpm-lock.yaml vite.config.ts
git commit -m "chore(test): configurar Vitest en el front"
```

### Task 4: `mensajeDeError` en `api/common.ts` y sustitución de los 8 `catch (err: any)`

**Files:**
- Modify: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\api\common.ts`
- Test: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\api\common.test.ts`
- Modify (sustituir el catch): `src/app/admin/pages/AdminCompras.tsx` (2, líneas ~225 y ~261), `AdminDashboard.tsx` (~61), `AdminGastos.tsx` (~46), `AdminPrecios.tsx` (2, ~107 y ~136), `src/app/admin/ventas/useVentas.ts` (2, ~114 y ~134)

**Interfaces:**
- Produces: `export function mensajeDeError(err: unknown, fallback: string): string` en `src/app/api/common.ts`. Reglas: si `err` tiene `response.data.message` string no vacío, lo devuelve; si es arreglo de strings, los une con `', '`; en cualquier otro caso (undefined, null, string suelto, `Error` sin `response`, `message` vacío) devuelve `fallback`. Sin importar axios (regla de arquitectura): se lee estructuralmente.

- [ ] **Step 1: Escribir los tests fallidos** en `common.test.ts` (imports de `vitest`), con estos casos y aserciones:
  - `mensajeDeError({ response: { data: { message: 'Stock insuficiente' } } }, 'x')` → `'Stock insuficiente'`
  - `mensajeDeError({ response: { data: { message: ['a debe ser texto', 'b es obligatorio'] } } }, 'x')` → `'a debe ser texto, b es obligatorio'`
  - `mensajeDeError(new Error('boom'), 'Error al guardar')` → `'Error al guardar'`
  - `mensajeDeError(undefined, 'f')`, `mensajeDeError(null, 'f')`, `mensajeDeError('texto', 'f')` → `'f'`
  - `mensajeDeError({ response: { data: { message: '' } } }, 'f')` y `{ response: {} }` → `'f'`
  - Los casos existentes de `params(...)` no se tocan; añadir uno: `params({ a: 1, b: '', c: undefined })` → `{ a: '1' }`.

- [ ] **Step 2: Verlos fallar**

Run: `pnpm test src/app/api/common.test.ts`
Expected: FAIL (`mensajeDeError` no existe).

- [ ] **Step 3: Implementar** `mensajeDeError(err: unknown, fallback: string): string` en `common.ts` con narrowing estructural (sin `any`).

- [ ] **Step 4: Verlos pasar**: mismo comando, Expected: PASS.

- [ ] **Step 5: Sustituir los 8 catch.** En cada archivo: `catch (err: any)` → `catch (err)` y `err?.response?.data?.message ?? 'X'` → `mensajeDeError(err, 'X')`, conservando el texto de respaldo de cada sitio (p. ej. `'Error al guardar la venta'`, `'Error al guardar'`). Importar `mensajeDeError` desde la ruta relativa de `api/common`. Si algún catch hace algo más que leer el mensaje, conservarlo.

- [ ] **Step 6: Verificar**

Run: `grep -rn "err: any" src` — Expected: sin resultados.
Run: `pnpm typecheck` — Expected: sin errores (incluye `check-architecture.mjs`; `common.ts` no debe importar axios).
Run: `pnpm test` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/common.ts src/app/api/common.test.ts src/app/admin
git commit -m "refactor(front): mensajeDeError compartido en api/common"
```

### Task 5: Tests de `lib/precio` y `lib/volver`

**Files:**
- Test: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\lib\precio.test.ts`
- Test: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\lib\volver.test.ts`

**Interfaces:**
- Consumes: `precioEfectivo(producto: Pick<Producto,"precio"> & { precios?: Producto["precios"] }, autenticado: boolean): PrecioEfectivo` (`{ precioOriginal, precioFinal, descuentoPorcentaje, enPromocion }`); `destinoSeguro(valor: string | null | undefined): string`; `rutaDeAcceso(destino: string, pantalla?: "/login" | "/register"): string`; `PARAM_VOLVER = "volver"`.
- Son tests de caracterización: pasan desde el primer run (el código ya existe). Pasarán a ser la red de la Fase 4.

- [ ] **Step 1: Escribir `precio.test.ts`** con casos: invitado usa `precios.invitado.final`; autenticado usa `precios.cuenta.final`; `descuento > 0` → `enPromocion: true` y `descuentoPorcentaje` igual; producto **sin `precios`** (como los del carrito antiguo) → `precioFinal === precio`, `enPromocion: false`, `descuentoPorcentaje: 0`; `precioOriginal` siempre es `producto.precio`.

- [ ] **Step 2: Escribir `volver.test.ts`** con casos: `destinoSeguro('/cuenta/pedidos')` → igual; `null`, `undefined`, `''` → `'/catalog'`; `'//evil.com'`, `'/\\evil.com'`, `'https://evil.com'`, `'evil'` → `'/catalog'`; `'/login'`, `'/register?x=1'`, `'/reset-password#token=abc'` → `'/catalog'`; `'/producto/1?a=b#c'` → igual. `rutaDeAcceso('/cuenta')` → `'/login?volver=%2Fcuenta'`; `rutaDeAcceso('/cuenta', '/register')` → `'/register?volver=%2Fcuenta'`; `rutaDeAcceso('//evil.com')` → `'/login'`.

- [ ] **Step 3: Verificar**

Run: `pnpm test src/app/lib/precio.test.ts src/app/lib/volver.test.ts`
Expected: PASS. Si una aserción falla porque el código real se comporta distinto, ajustar la aserción solo si el comportamiento real es el deseado; si es un defecto, anotarlo para la fase correspondiente y no corregirlo aquí.

- [ ] **Step 4: Commit**

```bash
git add src/app/lib/precio.test.ts src/app/lib/volver.test.ts
git commit -m "test(front): caracterizar precioEfectivo y destinoSeguro"
```

### Task 6: Tests de `lib/checkout`

**Files:**
- Test: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\lib\checkout.test.ts`

**Interfaces:**
- Consumes: `submitCheckout(params: { items: CartItem[]; totalPrice: number; metodoPago: MetodoPago; form: ShippingForm }): Promise<CheckoutResult>` donde `CheckoutResult = { kind:'contraentrega'; order: OrderResponse } | { kind:'mercadopago'; checkoutUrl: string }`; dependencias a mockear con `vi.mock`: `../api/orders` (`ordersApi.crear`), `../api/payments` (`paymentsApi.crearPendiente`), `./metaPixel` (`trackInitiateCheckout`, `trackPurchase`, `setMetaUserData`, `getFbCookies`).

- [ ] **Step 1: Escribir los tests** (mocks con `vi.mock` + `vi.fn`; `getFbCookies` devuelve `{ fbp: 'fb.1', fbc: 'fc.1' }`):
  - CONTRAENTREGA: llama `ordersApi.crear` con `{ metodoPago:'CONTRAENTREGA', items:[{productId, cantidad}], shippingInfo: form, fbp:'fb.1', fbc:'fc.1' }`, devuelve `{ kind:'contraentrega', order }`, llama `trackPurchase` una vez con `orderNumber` y el total, y **no** llama a `paymentsApi.crearPendiente`.
  - MERCADOPAGO: llama `paymentsApi.crearPendiente` con `{ items, shippingInfo, fbp, fbc }`, devuelve `{ kind:'mercadopago', checkoutUrl }`, **no** llama `trackPurchase` ni `ordersApi.crear`.
  - Ambos: `trackInitiateCheckout` con los items y el total; `setMetaUserData` recibe `firstName` = primer token del nombre y `lastName` = resto (`'Ana María Pérez'` → `'Ana'` / `'María Pérez'`), y `lastName: undefined` con un solo nombre.
  - Si `ordersApi.crear` rechaza, `submitCheckout` rechaza y `trackPurchase` no se llama.
  Si importar `CartContext` (tipo) o `metaPixel` arrastra módulos con efectos en entorno node, usar `import type` y mockear el módulo completo.

- [ ] **Step 2: Verificar**

Run: `pnpm test src/app/lib/checkout.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/lib/checkout.test.ts
git commit -m "test(front): caracterizar submitCheckout"
```

### Task 7: Tests del reducer del carrito y de `venta-form`

**Files:**
- Modify: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\context\CartContext.tsx` (solo `export` de `cartReducer`, `CartState` y `CartAction`; sin cambiar lógica)
- Test: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\context\cartReducer.test.ts`
- Test: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\src\app\admin\ventas\venta-form.test.ts`

**Interfaces:**
- Produces: `export function cartReducer(state: CartState, action: CartAction): CartState` con `CartState = { items: CartItem[]; isOpen: boolean }` y acciones `ADD | REMOVE | UPDATE_QTY | CLEAR | OPEN | CLOSE | TOGGLE` (la Fase 4 reescribe el estado a `{ id, cantidad }`; estos tests se actualizan allí).
- Consumes: `recalcEstado(f: FormState): FormState`, `datosDesdeForm(f: FormState): DatosVenta`, `EMPTY_FORM`.

- [ ] **Step 1: Exportar el reducer** en `CartContext.tsx`: `export function cartReducer`, `export interface CartState`, `export type CartAction`. Nada más.

- [ ] **Step 2: Escribir `cartReducer.test.ts`** (producto de prueba `{ id:'p1', stock: 3, ... }` casteado a `Producto`): `ADD` a carrito vacío → 1 ítem, `isOpen: true`; `ADD` repetido suma 1; `ADD` no supera `stock` (con stock 1, dos `ADD` → cantidad 1); `ADD` con `stock: 0` no añade ítem pero abre; `UPDATE_QTY` con `cantidad: 0` elimina; `UPDATE_QTY` con 99 y stock 3 → 3; `REMOVE`; `CLEAR` vacía ítems y conserva `isOpen`; `TOGGLE` alterna. Si importar `CartContext.tsx` falla en entorno node (por `usePrecioDe` → contextos → `import.meta.env`), añadir `vi.mock('../hooks/usePrecio', () => ({ usePrecioDe: vi.fn() }))`.

- [ ] **Step 3: Escribir `venta-form.test.ts`**: `recalcEstado` con `precioVenta:'100000', abono:'100000'` → `'Pagado'`; `abono:'50000'` → `'Abonado'`; `abono:''` → `'Pendiente'`; `precioVenta:''` o `'0'` → devuelve el estado sin cambiar (por ejemplo `'Uso Personal'` se conserva); `datosDesdeForm`: convierte números (`'100000'` → `100000`), campos opcionales vacíos (`celular:''`, `estilo:''`, `fuente:''`) → `undefined`. `formDesdeVenta` queda fuera: la Fase 4 toca fechas.

- [ ] **Step 4: Verificar**

Run: `pnpm test` — Expected: todos PASS.
Run: `pnpm typecheck` — Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/context src/app/admin/ventas/venta-form.test.ts
git commit -m "test(front): caracterizar cartReducer y venta-form"
```

### Task 8: ESLint flat config en el front

**Files:**
- Create: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\eslint.config.js`
- Modify: `d:\C3LECT\BOVEDA\boveda-c3lect-v2\package.json` (devDependencies `eslint@^9`, `@eslint/js@^9`, `typescript-eslint@^8`, `eslint-plugin-react-hooks@^5.2.0`, `globals`; script `lint`)
- Modify: los archivos con hallazgos (ver paso 4)

**Interfaces:**
- Produces: `pnpm lint` (= `eslint src`, exit 0 limpio). Reglas: `typescript-eslint` recomendado (sin type-checking, para que corra rápido), `react-hooks/rules-of-hooks: error`, `react-hooks/exhaustive-deps: error`, `@typescript-eslint/no-explicit-any: error`. Se fija react-hooks en la 5.x para no activar las reglas del React Compiler de la 7.x, que no se piden.

- [ ] **Step 1: Instalar**: `pnpm add -D eslint@^9 @eslint/js@^9 typescript-eslint@^8 eslint-plugin-react-hooks@^5.2.0 globals`.

- [ ] **Step 2: Crear `eslint.config.js`** (ESM, el paquete es `"type": "module"`): `ignores` de `dist`, `ds-bundle`, `.ds-sync`, `public`, `scripts`; `js.configs.recommended` + `tseslint.configs.recommended`; bloque para `src/**/*.{ts,tsx}` con `globals.browser`, plugin `react-hooks` y las tres reglas anteriores en `error`; bloque para `**/*.test.ts` con `globals.node`. Añadir `"lint": "eslint src"` a scripts.

- [ ] **Step 3: Ver el estado real**

Run: `pnpm lint`
Expected: FAIL con una lista de hallazgos. Estimación al leer el código (no verificable antes de instalar): `no-explicit-any` en `src/app/data/resenas.ts` (`mapear(r: any)`) y 4 en `src/app/lib/metaPixel.ts` (`fbq`, `_fbq`, `f: any`, `n: any`, `...args: any[]`); `exhaustive-deps` en algunos de los ~34 archivos que usan `useEffect/useCallback/useMemo`; posibles `no-unused-vars` y `no-empty`. Los 8 `catch (err: any)` ya no existen (Tarea 4).

- [ ] **Step 4: Corregir** cada hallazgo: para `any` tipar (p. ej. interfaz de la fila de `resenas_publicas` en `data/resenas.ts`); para el stub de `fbq` en `metaPixel.ts` usar `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub del snippet oficial de Meta Pixel` por línea; para `exhaustive-deps` añadir la dependencia o estabilizar la función con `useCallback`; solo si hacerlo exige rediseño usar `// eslint-disable-next-line react-hooks/exhaustive-deps -- <motivo concreto>`. Ninguna desactivación sin motivo escrito, ninguna desactivación a nivel de archivo.

- [ ] **Step 5: Verificar**

Run: `pnpm lint` — Expected: exit 0.
Run: `pnpm typecheck` — Expected: sin errores.
Run: `pnpm test` — Expected: PASS.
Run: `pnpm build` — Expected: build correcto.
Comprobar en el navegador (`pnpm dev`) las pantallas cuyos efectos se modificaron en el paso 4: que carguen sin bucles de peticiones (pestaña Network estable).

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js package.json pnpm-lock.yaml src
git commit -m "chore(lint): ESLint con react-hooks y no-explicit-any en el front"
```

---

## Autorrevisión

- **Cobertura de la spec (Fase 0):** `lint:check` (T1), `no-floating-promises` a error (T1), alinear Prisma (T2), Vitest + script `test` (T3), ESLint flat config + script `lint` (T8), tests de `precio`/`volver` (T5), `checkout` (T6), reducer y `venta-form` (T7), `mensajeDeError` y los 8 catch (T4). Sin huecos.
- **Consistencia de nombres:** `mensajeDeError(err: unknown, fallback: string)`, `cartReducer`, `lint:check`, `lint`, `test` usados igual en todas las tareas.
- **Orden:** T4–T7 antes de T8 para que ESLint ya vea los tests y no haya `any` de catch. T3 antes de todos los tests.
- **Fuera de este plan:** CI del front (no existe `.github` en `boveda-c3lect-v2`); crear pipeline queda a decisión del dueño.
