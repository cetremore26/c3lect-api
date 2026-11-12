# Fase 4 — Frontend: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** corregir en `boveda-c3lect-v2` los hallazgos de la revisión del front (F-A1, F-M2, F-M3, F-M4, F-B1, F-B2, F-B4…F-B9) que la spec asigna a la Fase 4, salvo "Registro" (ya hecho en la Fase 1).

**Arquitectura:** la lógica nueva va a módulos puros en `src/app/lib/` (y `src/app/admin/productos/`) con tests de Vitest; páginas y contextos solo la conectan. La sesión avisa a React con un `CustomEvent` en `window`; el carrito guarda solo `{ id, cantidad }` y se resuelve contra el catálogo en cada render.

**Tech stack:** Vite 6, React 18, react-router 7, TypeScript 5, Vitest y ESLint (los deja la Fase 0), date-fns 3.6, pnpm.

**Spec:** `c3lect-api/docs/superpowers/specs/2026-11-10-correcciones-revision-design.md` (sección "Fase 4 — Frontend"). Detalle de cada hallazgo: el informe de la revisión del front (F-xx).

**Repo y rama:** todas las tareas van en `d:\C3LECT\BOVEDA\boveda-c3lect-v2`, rama `fix/correcciones-revision`. Las rutas del plan son relativas a ese repo.

## Restricciones globales

- Requisitos previos: Fase 0 (`pnpm test` = `vitest run`, `pnpm lint`, `mensajeDeError(err: unknown, fallback: string): string` en `src/app/api/common.ts`), Fase 1 (cambios de `AuthContext`, `Login`, `Register` y `ResetPassword`: **consérvalos**; este plan solo toca las funciones que nombra) y Fase 3 (`POST /orders` acepta `idempotencyKey` UUID y, si se repite, devuelve el pedido ya creado).
- Compatibilidad: el front nuevo tiene que funcionar con la API vieja (`idempotencyKey` se descarta por `whitelist`). No se cambia ningún contrato de la API.
- Reglas de `scripts/check-architecture.mjs`: `api/client` solo se importa desde `src/app/api/`, `axios` solo en `api/client.ts`.
- Los tests van junto al módulo (`x.ts` → `x.test.ts`) y no tocan el DOM: lo que depende de `window` o de `localStorage` recibe el objeto por parámetro, o el test lo sustituye con `vi.stubGlobal`.
- Se mantienen las claves `sessionStorage` `accessToken` y `refreshToken`. `authUser` deja de escribirse, pero se sigue borrando para limpiar sesiones viejas.
- Commits con Conventional Commits, en español, **sin** `Co-Authored-By` ni menciones a Claude o a herramientas de IA.
- Al terminar cada tarea: `pnpm test`, `pnpm lint` y `pnpm typecheck` en verde.

## Valores fijados (los usan varias tareas)

| Qué | Valor |
|---|---|
| Evento de sesión cerrada | `'c3lect:sesion-cerrada'`, `CustomEvent<{ motivo: 'expirada' \| 'logout' }>` |
| Rutas protegidas (redirigen al login si la sesión muere) | `/cuenta` y `/cuenta/…`, `/admin` y `/admin/…`, solo `/checkout` exacto (no `/checkout/success\|failure\|pending`) |
| Clave del carrito en `localStorage` | `'c3lect-cart'` (la misma de hoy; se migra el formato viejo) |
| Clave de `pendingCheckout` en `localStorage` | `'c3lect-pending-checkout'`, valor `{ "creadoEn": <ms epoch> }` |
| Dominios válidos de MercadoPago | `mercadopago.com.co`, `mercadopago.com` (host igual o subdominio, p. ej. `www.` o `sandbox.`), solo `https:` |
| `idempotencyKey` | `crypto.randomUUID()` generado una vez al montar `Checkout` (`useState(() => crypto.randomUUID())`); solo se envía en `POST /orders` |

## Puntos de revisión

1. **El catálogo no carga (Supabase caído o lento):** el carrito no debe marcar todo como retirado ni perder líneas. Queda en `resolviendo` y conserva lo guardado. Test en la tarea 4.
2. **Carrito guardado con el formato viejo** (`[{ producto: {...}, cantidad }]`) al desplegar: hay que migrarlo a `{ id, cantidad }` sin perder nada. Test en la tarea 4.
3. **`localStorage` corrupto o con líneas inválidas** (JSON roto, cantidad ≤ 0 o no entera, id que no es string): el carrito queda vacío o sin esas líneas y no se rompe. Test en la tarea 4.
4. **Entrar a `/checkout/success` por URL sin `pendingCheckout`:** no vacía el carrito. Test en la tarea 3.
5. **La sesión expira estando en `/checkout/success` o `/checkout/failure`:** no redirige al login (no son rutas protegidas). Test en la tarea 1.

---

### Task 1: Sesión caducada sin expulsar de páginas públicas, sin fallback de `authUser` [F-M3, F-B8]

**Archivos:**
- Crear: `src/app/lib/sesion.ts`, `src/app/lib/sesion.test.ts`
- Modificar: `src/app/api/client.ts` (`clearSessionAndRedirect`), `src/app/context/AuthContext.tsx` (efecto de arranque, `saveSession`, `clearSession`, `refrescarUsuario`, nuevo efecto que escucha el evento)

**Interfaces:**
- Produce (en `lib/sesion.ts`):
  - `EVENTO_SESION_CERRADA = 'c3lect:sesion-cerrada'`
  - `type MotivoCierre = 'expirada' | 'logout'`
  - `esRutaProtegida(pathname: string): boolean`
  - `borrarSesionGuardada(): void`: borra `accessToken`, `refreshToken` y `authUser` de `sessionStorage`.
  - `emitirSesionCerrada(motivo: MotivoCierre): void`
  - `escucharSesionCerrada(handler: (motivo: MotivoCierre) => void): () => void`: devuelve la función que quita el listener.

- [ ] **Paso 1: escribir los tests que fallan** en `src/app/lib/sesion.test.ts`

```ts
describe('esRutaProtegida', () => {
  it.each(['/cuenta', '/cuenta/datos', '/admin', '/admin/productos/1', '/checkout'])('%s es protegida', (r) =>
    expect(esRutaProtegida(r)).toBe(true));
  it.each(['/', '/catalog', '/product/1', '/login', '/checkout/success', '/checkout/failure', '/checkout/pending', '/cuentas', '/administrar'])(
    '%s es pública', (r) => expect(esRutaProtegida(r)).toBe(false));
});

describe('evento de sesión cerrada', () => {
  it('entrega el motivo al listener y deja de llamarlo al desuscribirse', () => {
    vi.stubGlobal('window', new EventTarget());
    const visto: string[] = [];
    const quitar = escucharSesionCerrada((m) => visto.push(m));
    emitirSesionCerrada('expirada');
    quitar();
    emitirSesionCerrada('logout');
    expect(visto).toEqual(['expirada']);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Paso 2: comprobar que fallan**
Ejecuta `pnpm test src/app/lib/sesion.test.ts`. Esperado: FAIL, porque el módulo `./sesion` no existe.

- [ ] **Paso 3: implementar `lib/sesion.ts`**
Usa `window.dispatchEvent(new CustomEvent(EVENTO_SESION_CERRADA, { detail: { motivo } }))` y `window.addEventListener`. Una ruta es protegida si `p === '/cuenta' || p.startsWith('/cuenta/') || p === '/admin' || p.startsWith('/admin/') || p === '/checkout'`.

- [ ] **Paso 4: conectar `api/client.ts` y `AuthContext`**
  - `clearSessionAndRedirect()`: llama a `borrarSesionGuardada()` y luego a `emitirSesionCerrada('expirada')`. Solo si `esRutaProtegida(window.location.pathname)` asigna `window.location.href = rutaDeAcceso(pathname + search)`. Se quita la comprobación `!== '/login'`, que ya no hace falta.
  - `AuthContext`: `clearSession` pasa a llamar a `borrarSesionGuardada()`. `saveSession` y `refrescarUsuario` dejan de escribir `authUser`. En el `.catch` de `authApi.yo()` del arranque se elimina todo el fallback: queda `clearSession()` y `user` en `null` ante cualquier error. Se añade un `useEffect(() => escucharSesionCerrada((m) => { if (m === 'expirada') { setUser(null); setAccessToken(null); } }), [])`.

- [ ] **Paso 5: verificar**
Ejecuta `pnpm test src/app/lib/sesion.test.ts && pnpm lint && pnpm typecheck`. Esperado: todo PASS, sin errores.

- [ ] **Paso 6: commit**
```bash
git add src/app/lib/sesion.ts src/app/lib/sesion.test.ts src/app/api/client.ts src/app/context/AuthContext.tsx
git commit -m "fix(sesion): no expulsar de páginas públicas al caducar la sesión y quitar fallback de authUser"
```

---

### Task 2: `submitCheckout` con clave de idempotencia, URL de MercadoPago validada y total del backend [F-A1, F-B1, F-M2]

**Archivos:**
- Modificar: `src/app/api/orders.ts` (`NuevoPedido`, retorno de `crear`), `src/app/lib/checkout.ts`
- Test: `src/app/lib/checkout.test.ts` (lo crea la Fase 0; si no existe, créalo)

**Interfaces:**
- Produce en `api/orders.ts`:
  - `NuevoPedido` gana `idempotencyKey?: string`.
  - `export interface PedidoCreado { id: string; orderNumber: string; subtotal: number; total: number }`
  - `ordersApi.crear(pedido: NuevoPedido): Promise<PedidoCreado>`
- Produce en `lib/checkout.ts`:
  - `DOMINIOS_MERCADOPAGO = ['mercadopago.com.co', 'mercadopago.com'] as const`
  - `esUrlDeMercadoPago(url: string): boolean`
  - `class CheckoutUrlInvalidaError extends Error`, con mensaje `'No pudimos abrir MercadoPago. Intenta de nuevo en un momento.'`
  - `OrderResponse` pasa a ser `PedidoCreado` (alias reexportado). `CheckoutResult` no cambia de forma.
  - `submitCheckout(params: { items: CartItem[]; totalPrice: number; metodoPago: MetodoPago; form: ShippingForm; idempotencyKey: string }): Promise<CheckoutResult>`

- [ ] **Paso 1: escribir los tests que fallan**
Simula `../api/orders`, `../api/payments` y `./metaPixel` con `vi.mock`.

```ts
describe('esUrlDeMercadoPago', () => {
  it.each([
    'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=1',
    'https://sandbox.mercadopago.com.co/checkout/v1/redirect?pref_id=1',
    'https://www.mercadopago.com/checkout/v1/redirect?pref_id=1',
  ])('acepta %s', (u) => expect(esUrlDeMercadoPago(u)).toBe(true));
  it.each(['', 'no es url', 'http://www.mercadopago.com.co/x', 'https://mercadopago.com.co.evil.com/x',
    'https://evilmercadopago.com/x', 'javascript:alert(1)'])('rechaza %j', (u) => expect(esUrlDeMercadoPago(u)).toBe(false));
});

it('contraentrega envía idempotencyKey y usa el total del backend para el Purchase', async () => {
  ordersApi.crear.mockResolvedValue({ id: 'o1', orderNumber: 'C-1', subtotal: 1_000_000, total: 1_000_000 });
  const r = await submitCheckout({ items, totalPrice: 900_000, metodoPago: 'CONTRAENTREGA', form, idempotencyKey: 'k-1' });
  expect(ordersApi.crear).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'k-1' }));
  expect(trackPurchase).toHaveBeenCalledWith(expect.objectContaining({ total: 1_000_000 }));
  expect(r).toEqual({ kind: 'contraentrega', order: expect.objectContaining({ total: 1_000_000 }) });
});

it('MercadoPago con checkoutUrl vacío o ajeno lanza CheckoutUrlInvalidaError', async () => {
  paymentsApi.crearPendiente.mockResolvedValue({ checkoutUrl: '' });
  await expect(submitCheckout({ ...base, metodoPago: 'MERCADOPAGO' })).rejects.toBeInstanceOf(CheckoutUrlInvalidaError);
});

it('MercadoPago no envía idempotencyKey a create-pending', async () => {
  paymentsApi.crearPendiente.mockResolvedValue({ checkoutUrl: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=1' });
  await submitCheckout({ ...base, metodoPago: 'MERCADOPAGO' });
  expect(paymentsApi.crearPendiente.mock.calls[0][0]).not.toHaveProperty('idempotencyKey');
});
```

- [ ] **Paso 2: comprobar que fallan**
Ejecuta `pnpm test src/app/lib/checkout.test.ts`. Esperado: FAIL, porque `esUrlDeMercadoPago` y `CheckoutUrlInvalidaError` no están definidos.

- [ ] **Paso 3: implementar**
`esUrlDeMercadoPago` hace `new URL(url)` dentro de `try` (si lanza, devuelve `false`). Exige `protocol === 'https:'` y que el `hostname` sea igual a un dominio de la lista o termine en `'.' + dominio`. En la rama MP, `submitCheckout` valida `pago.checkoutUrl` y lanza el error antes de devolver. `trackPurchase` usa `order.total`.

- [ ] **Paso 4: verificar**
Ejecuta `pnpm test src/app/lib/checkout.test.ts && pnpm typecheck`. Esperado: PASS. `typecheck` fallará en `Checkout.tsx` por el parámetro nuevo; pásale de momento `idempotencyKey: crypto.randomUUID()` para que compile. La tarea 3 lo cambia por la clave del montaje.

- [ ] **Paso 5: commit**
```bash
git add src/app/api/orders.ts src/app/lib/checkout.ts src/app/lib/checkout.test.ts src/app/pages/Checkout.tsx
git commit -m "fix(checkout): clave de idempotencia, validar URL de MercadoPago y usar el total del backend"
```

---

### Task 3: `pendingCheckout`, pantalla de checkout y `CheckoutResult` [F-M2, F-A1, F-B1, F-B7]

**Archivos:**
- Crear: `src/app/lib/checkoutPendiente.ts`, `src/app/lib/checkoutPendiente.test.ts`, `src/app/lib/resultadoCheckout.ts`, `src/app/lib/resultadoCheckout.test.ts`, `src/test/almacenMemoria.ts`
- Modificar: `src/app/pages/Checkout.tsx`, `src/app/pages/CheckoutResult.tsx`

**Interfaces:**
- Consume: `submitCheckout`, `CheckoutUrlInvalidaError` y `PedidoCreado` (tarea 2); `mensajeDeError` (Fase 0).
- Produce:
  - `lib/checkoutPendiente.ts`:
    - `type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`
    - `CLAVE_PENDING_CHECKOUT = 'c3lect-pending-checkout'`
    - `interface PendingCheckout { creadoEn: number }`
    - `guardarPendingCheckout(almacen: Almacen, ahora: number): void`
    - `leerPendingCheckout(almacen: Almacen): PendingCheckout | null`: devuelve `null` si falta, si el JSON es inválido o si `creadoEn` no es un número finito.
    - `borrarPendingCheckout(almacen: Almacen): void`
  - `lib/resultadoCheckout.ts`:
    - `type EstadoResultado = 'success' | 'failure' | 'pending'`
    - `estadoDesdeRuta(pathname: string): EstadoResultado`
    - `numeroDePedidoVisible(estado: EstadoResultado, search: string): string | null`: devuelve `external_reference` solo si el estado es `success`.
    - `efectoDelResultado(estado: EstadoResultado, pendiente: PendingCheckout | null): { vaciarCarrito: boolean; borrarPendiente: boolean }`
    - `TEXTOS_RESULTADO: Record<EstadoResultado, { titulo: string; cuerpo: string; cta: { texto: string; a: string } }>`
  - `src/test/almacenMemoria.ts`: `almacenMemoria(): Almacen`, respaldado por un `Map` (también lo usa la tarea 4).

**Textos (copia exacta):**
- `success`: «Pago aprobado» / «Tu pago fue aprobado. En unos minutos te llegará a tu correo la confirmación del pedido.» / CTA «Seguir explorando» → `/catalog`
- `failure`: «Pago no completado» / «MercadoPago no aprobó el pago, así que no se creó ningún pedido. Tu carrito sigue guardado: puedes intentarlo de nuevo.» / CTA «Volver al checkout» → `/checkout`
- `pending`: «Pago en proceso» / «MercadoPago está procesando tu pago. Cuando se apruebe crearemos tu pedido y te avisaremos por correo. Tu carrito sigue guardado; no vuelvas a pagar mientras tanto.» / CTA «Seguir explorando» → `/catalog`

- [ ] **Paso 1: escribir los tests que fallan**

```ts
// checkoutPendiente.test.ts
it('guarda, lee y borra', () => {
  const a = almacenMemoria();
  guardarPendingCheckout(a, 1_700_000_000_000);
  expect(a.getItem('c3lect-pending-checkout')).toBe('{"creadoEn":1700000000000}');
  expect(leerPendingCheckout(a)).toEqual({ creadoEn: 1_700_000_000_000 });
  borrarPendingCheckout(a);
  expect(leerPendingCheckout(a)).toBeNull();
});
it.each(['{roto', '{"creadoEn":"x"}', 'null'])('valor inválido %s → null', (v) => {
  const a = almacenMemoria(); a.setItem('c3lect-pending-checkout', v);
  expect(leerPendingCheckout(a)).toBeNull();
});

// resultadoCheckout.test.ts
it.each([['/checkout/success', 'success'], ['/checkout/failure', 'failure'], ['/checkout/pending', 'pending']])(
  '%s → %s', (r, e) => expect(estadoDesdeRuta(r)).toBe(e));
it('el número de pedido solo se muestra en success', () => {
  expect(numeroDePedidoVisible('success', '?external_reference=C-1')).toBe('C-1');
  expect(numeroDePedidoVisible('failure', '?external_reference=C-1')).toBeNull();
  expect(numeroDePedidoVisible('pending', '?external_reference=C-1')).toBeNull();
});
it('success con pendiente vacía el carrito y borra el pendiente', () =>
  expect(efectoDelResultado('success', { creadoEn: 1 })).toEqual({ vaciarCarrito: true, borrarPendiente: true }));
it('success sin pendiente (entrada por URL) no vacía nada', () =>
  expect(efectoDelResultado('success', null)).toEqual({ vaciarCarrito: false, borrarPendiente: false }));
it('failure conserva el carrito y borra el pendiente', () =>
  expect(efectoDelResultado('failure', { creadoEn: 1 })).toEqual({ vaciarCarrito: false, borrarPendiente: true }));
it('pending no toca nada', () =>
  expect(efectoDelResultado('pending', { creadoEn: 1 })).toEqual({ vaciarCarrito: false, borrarPendiente: false }));
it('los textos de failure ya no hablan de un pedido cancelado', () =>
  expect(TEXTOS_RESULTADO.failure.cuerpo).not.toMatch(/cancelad/i));
```

- [ ] **Paso 2: comprobar que fallan**
Ejecuta `pnpm test src/app/lib/checkoutPendiente.test.ts src/app/lib/resultadoCheckout.test.ts`. Esperado: FAIL, porque los módulos no existen.

- [ ] **Paso 3: implementar los dos módulos y el fake**

- [ ] **Paso 4: conectar las páginas**
  - `Checkout.tsx`:
    - `const [idempotencyKey] = useState(() => crypto.randomUUID())`, que se pasa a `submitCheckout`.
    - Contraentrega: `clearCart()`, `borrarPendingCheckout(localStorage)` y `setPedidoConfirmado(result.order)`.
    - MercadoPago: **no** llama a `clearCart`; hace `guardarPendingCheckout(localStorage, Date.now())` y después `window.location.href = result.checkoutUrl`.
    - `catch`: si `err instanceof CheckoutUrlInvalidaError`, usa `err.message`; si no, `mensajeDeError(err, 'No se pudo procesar el pedido. Intenta de nuevo.')`.
    - En la confirmación, debajo del número, añade el párrafo «Total a pagar contra entrega: <strong>{formatPrecio(pedidoConfirmado.total)}</strong>».
  - `CheckoutResult.tsx`: usa `estadoDesdeRuta`, `numeroDePedidoVisible` y `TEXTOS_RESULTADO`. Un `useEffect` de montaje calcula `efectoDelResultado(estado, leerPendingCheckout(localStorage))` y, según el resultado, llama a `clearCart()` (de `useCart`) y a `borrarPendingCheckout(localStorage)`. Los iconos se mantienen: `CheckCircle2`, `XCircle` y `Clock`.

- [ ] **Paso 5: verificar**
Ejecuta `pnpm test && pnpm lint && pnpm typecheck`. Esperado: todo en verde.

- [ ] **Paso 6: commit**
```bash
git add src/app/lib/checkoutPendiente.ts src/app/lib/checkoutPendiente.test.ts src/app/lib/resultadoCheckout.ts src/app/lib/resultadoCheckout.test.ts src/test/almacenMemoria.ts src/app/pages/Checkout.tsx src/app/pages/CheckoutResult.tsx
git commit -m "fix(checkout): conservar el carrito hasta que MercadoPago apruebe y corregir textos del resultado"
```

---

### Task 4: carrito con `{ id, cantidad }` resuelto contra el catálogo y vaciado al cerrar sesión [F-B4, F-B8]

**Archivos:**
- Crear: `src/app/lib/carrito.ts`, `src/app/lib/carrito.test.ts`
- Modificar: `src/app/context/CartContext.tsx`, `src/app/components/CartDrawer.tsx`, `src/app/pages/Checkout.tsx`, `src/app/lib/checkout.ts` (importa `CartItem` desde `./carrito`), `src/app/context/AuthContext.tsx` (`logout`)
- Si la Fase 0 dejó tests del reducer en otro archivo (p. ej. `src/app/context/CartContext.test.ts`), muévelos a `src/app/lib/carrito.test.ts` y adáptalos al estado nuevo.

**Interfaces:**
- Consume: `Almacen` y `CLAVE_PENDING_CHECKOUT` (tarea 3); `emitirSesionCerrada` y `escucharSesionCerrada` (tarea 1).
- Produce en `lib/carrito.ts`:
  - `CLAVE_CARRITO = 'c3lect-cart'`
  - `interface LineaCarrito { id: string; cantidad: number }`
  - `interface CartItem { producto: Producto; cantidad: number }` (se reexporta desde `CartContext` con `export type { CartItem }`).
  - `interface LineaNoDisponible { id: string; cantidad: number; motivo: 'agotado' | 'retirado'; producto: Producto | null }`
  - `interface EstadoCarrito { lineas: LineaCarrito[]; isOpen: boolean }`
  - `type AccionCarrito = { type: 'ADD'; id: string; max?: number } | { type: 'REMOVE'; id: string } | { type: 'UPDATE_QTY'; id: string; cantidad: number; max?: number } | { type: 'CLEAR' | 'OPEN' | 'CLOSE' | 'TOGGLE' }`
  - `carritoReducer(state: EstadoCarrito, action: AccionCarrito): EstadoCarrito`: las mismas reglas que el reducer actual, con `max` en lugar de `producto.stock`.
  - `leerLineasGuardadas(almacen: Almacen): LineaCarrito[]`: acepta `{ id, cantidad }` y el formato viejo `{ producto: { id }, cantidad }`; descarta las entradas con `id` que no es string o con `cantidad` que no es un entero ≥ 1. Si el JSON está roto o no es un array, devuelve `[]`.
  - `guardarLineas(almacen: Almacen, lineas: LineaCarrito[]): void`
  - `borrarCarritoGuardado(almacen: Almacen): void`: borra `CLAVE_CARRITO` y `CLAVE_PENDING_CHECKOUT`.
  - `resolverCarrito(lineas: LineaCarrito[], productos: Producto[], catalogoListo: boolean): { items: CartItem[]; noDisponibles: LineaNoDisponible[]; resolviendo: boolean }`: si el catálogo no está listo, devuelve listas vacías y `resolviendo = true`. Si el producto no está en el catálogo, la línea es `retirado` (con `producto` a `null`). Si `!disponible` o `stock === 0`, es `agotado`. Si no, va a `items` con `cantidad = stock != null ? min(cantidad, stock) : cantidad`. Se respeta el orden de las líneas.
- Cambios en `CartContext` (añade a la API actual):
  - `noDisponibles: LineaNoDisponible[]`
  - `resolviendo: boolean`
  - `items` contiene solo productos comprables.
  - `totalPrice` se calcula sobre `items`; `totalItems` es la suma de `lineas` (para que el contador del menú aparezca antes de que cargue el catálogo).
  - `catalogoListo = !cargando && !error` de `useProductos()`.
  - `addItem(producto)` despacha `{ type: 'ADD', id: producto.id, max: producto.stock }`.
  - `updateQty(id, cantidad)` busca el `stock` vigente del producto para usarlo como `max`.

- [ ] **Paso 1: escribir los tests que fallan** en `src/app/lib/carrito.test.ts`

```ts
const p = (id: string, extra: Partial<Producto> = {}) => ({ id, disponible: true, stock: 5, ...extra }) as Producto;

it('ADD respeta max y UPDATE_QTY < 1 elimina', () => {
  let s = carritoReducer({ lineas: [], isOpen: false }, { type: 'ADD', id: 'a', max: 1 });
  s = carritoReducer(s, { type: 'ADD', id: 'a', max: 1 });
  expect(s.lineas).toEqual([{ id: 'a', cantidad: 1 }]);
  expect(carritoReducer(s, { type: 'UPDATE_QTY', id: 'a', cantidad: 0 }).lineas).toEqual([]);
});
it('ADD con max 0 no agrega', () =>
  expect(carritoReducer({ lineas: [], isOpen: false }, { type: 'ADD', id: 'a', max: 0 }).lineas).toEqual([]));
it('migra el formato viejo', () => {
  const a = almacenMemoria();
  a.setItem('c3lect-cart', JSON.stringify([{ producto: { id: 'a', stock: 9 }, cantidad: 2 }, { id: 'b', cantidad: 1 }]));
  expect(leerLineasGuardadas(a)).toEqual([{ id: 'a', cantidad: 2 }, { id: 'b', cantidad: 1 }]);
});
it.each(['{roto', '{"no":"array"}'])('JSON inválido %s → []', (v) => {
  const a = almacenMemoria(); a.setItem('c3lect-cart', v); expect(leerLineasGuardadas(a)).toEqual([]);
});
it('descarta líneas inválidas', () => {
  const a = almacenMemoria();
  a.setItem('c3lect-cart', JSON.stringify([{ id: 'a', cantidad: 0 }, { id: 1, cantidad: 1 }, { id: 'b', cantidad: 1.5 }, { id: 'c', cantidad: 1 }]));
  expect(leerLineasGuardadas(a)).toEqual([{ id: 'c', cantidad: 1 }]);
});
it('guardarLineas solo persiste id y cantidad', () => {
  const a = almacenMemoria(); guardarLineas(a, [{ id: 'a', cantidad: 2 }]);
  expect(a.getItem('c3lect-cart')).toBe('[{"id":"a","cantidad":2}]');
});
it('borrarCarritoGuardado borra carrito y pendingCheckout', () => {
  const a = almacenMemoria(); a.setItem('c3lect-cart', '[]'); a.setItem('c3lect-pending-checkout', '{"creadoEn":1}');
  borrarCarritoGuardado(a);
  expect([a.getItem('c3lect-cart'), a.getItem('c3lect-pending-checkout')]).toEqual([null, null]);
});
it('resuelve disponibles, agotados y retirados y ajusta al stock vigente', () => {
  const r = resolverCarrito(
    [{ id: 'a', cantidad: 4 }, { id: 'b', cantidad: 1 }, { id: 'c', cantidad: 1 }, { id: 'x', cantidad: 2 }],
    [p('a', { stock: 2 }), p('b', { disponible: false }), p('c', { stock: 0 })], true);
  expect(r.items.map((i) => [i.producto.id, i.cantidad])).toEqual([['a', 2]]);
  expect(r.noDisponibles.map((l) => [l.id, l.motivo])).toEqual([['b', 'agotado'], ['c', 'agotado'], ['x', 'retirado']]);
  expect(r.noDisponibles[2].producto).toBeNull();
  expect(r.resolviendo).toBe(false);
});
it('con el catálogo sin cargar no marca nada como retirado', () =>
  expect(resolverCarrito([{ id: 'a', cantidad: 1 }], [], false)).toEqual({ items: [], noDisponibles: [], resolviendo: true }));
```

- [ ] **Paso 2: comprobar que fallan**
Ejecuta `pnpm test src/app/lib/carrito.test.ts`. Esperado: FAIL, porque el módulo `./carrito` no existe.

- [ ] **Paso 3: implementar `lib/carrito.ts`**

- [ ] **Paso 4: conectar la UI**
  - `CartContext`:
    - El estado inicial es `{ lineas: leerLineasGuardadas(localStorage), isOpen: false }`, y un efecto llama a `guardarLineas(localStorage, state.lineas)`.
    - `resolverCarrito` se envuelve en `useMemo`.
    - Un efecto con `escucharSesionCerrada((m) => m === 'logout' && dispatch({ type: 'CLEAR' }))`.
    - `totalPrice` sigue usando `usePrecioDe()`, ahora sobre `items` (cuyo `producto` ya es el del catálogo vigente).
  - `AuthContext.logout()`: después de `clearSession()`, llama a `borrarCarritoGuardado(localStorage)` y a `emitirSesionCerrada('logout')`. Esto cubre también el logout desde `/admin`, donde `CartProvider` no está montado.
  - `CartDrawer`:
    - Debajo de los ítems, una lista de `noDisponibles` con el botón «Quitar» (`removeItem(id)`). Texto: «{producto.display} — Agotado» para `agotado` y «Un producto que agregaste ya no está en el catálogo» para `retirado`.
    - Mientras `resolviendo`, en lugar de la lista muestra «Cargando tu carrito…».
  - `Checkout`:
    - Mientras `resolviendo`, muestra «Cargando tu carrito…» en vez de «Tu carrito está vacío.».
    - Si `noDisponibles.length > 0`, aviso encima del formulario: «Algunos productos de tu carrito ya no están disponibles y no se incluirán en este pedido.».

- [ ] **Paso 5: verificar**
Ejecuta `pnpm test && pnpm lint && pnpm typecheck`. Esperado: todo en verde.

- [ ] **Paso 6: commit**
```bash
git add src/app/lib/carrito.ts src/app/lib/carrito.test.ts src/app/context/CartContext.tsx src/app/context/AuthContext.tsx src/app/components/CartDrawer.tsx src/app/pages/Checkout.tsx src/app/lib/checkout.ts
git commit -m "fix(carrito): guardar solo id y cantidad, resolver contra el catálogo vigente y vaciar al cerrar sesión"
```

---

### Task 5: fecha local por defecto en ventas, compras y gastos [F-M4]

**Archivos:**
- Modificar: `src/app/lib/format.ts`, `src/app/admin/ventas/venta-form.ts`, `src/app/admin/ventas/useVentas.ts`, `src/app/admin/pages/AdminVentas.tsx` (botón "Nueva"), `src/app/admin/pages/AdminCompras.tsx`, `src/app/admin/pages/AdminGastos.tsx`
- Test: `src/app/lib/format.test.ts` (créalo si no existe), `src/app/admin/ventas/venta-form.test.ts` (de la Fase 0)

**Interfaces:**
- Produce:
  - `hoyLocal(ahora: Date = new Date()): string`, con `format(ahora, 'yyyy-MM-dd')` de date-fns, en hora local.
  - En `venta-form.ts`, `EMPTY_FORM` se sustituye por `export function formVacio(): FormState`. `FormState` pasa a ser una `interface` explícita con los mismos campos.
  - En `AdminCompras` y `AdminGastos`, una función de módulo `formVacio()` reemplaza a su `EMPTY_FORM` local.

- [ ] **Paso 1: escribir los tests que fallan**

```ts
it('hoyLocal usa el día local, no el de UTC', () =>
  expect(hoyLocal(new Date(2026, 9, 31, 20, 0))).toBe('2026-10-31'));
it('formVacio fecha con el día de hoy en cada llamada', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 3, 9));
  expect(formVacio().fecha).toBe('2026-11-03');
  vi.setSystemTime(new Date(2026, 10, 5, 21));
  expect(formVacio().fecha).toBe('2026-11-05');
  vi.useRealTimers();
});
```

- [ ] **Paso 2: comprobar que fallan**
Ejecuta `pnpm test src/app/lib/format.test.ts src/app/admin/ventas/venta-form.test.ts`. Esperado: FAIL, porque `hoyLocal` y `formVacio` no existen.

- [ ] **Paso 3: implementar y conectar**
En los tres formularios:
- Estado inicial con `useState(formVacio)`, que es perezoso.
- Tras guardar, `setForm(formVacio())`.
- El botón que abre el formulario de alta, cuando pasa de cerrado a abierto, también hace `setForm(formVacio())`.
- En `AdminGastos`, `editForm` se tipa `Partial<ReturnType<typeof formVacio>>`.
- No queda ningún `toISOString().split('T')[0]` en esos archivos.

- [ ] **Paso 4: verificar**
Ejecuta `pnpm test && pnpm lint && pnpm typecheck`. Esperado: todo en verde. Además, `rg "toISOString\(\)\.split" src/app/admin` no devuelve nada.

- [ ] **Paso 5: commit**
```bash
git add src/app/lib/format.ts src/app/lib/format.test.ts src/app/admin
git commit -m "fix(admin): fecha por defecto en hora local y recalculada al abrir o reiniciar formularios"
```

---

### Task 6: `?resenar=1` espera a que termine la carga de la sesión [F-B2]

**Archivos:**
- Modificar: `src/app/lib/resenas.ts`, `src/app/hooks/useResenas.ts` (`usePendientesDeResena`), `src/app/components/resenas/SeccionResenas.tsx`
- Test: `src/app/lib/resenas.test.ts` (créalo si no existe)

**Interfaces:**
- Produce:
  - En `lib/resenas.ts`:
    - `type AccionResenar = 'esperar' | 'abrir' | 'descartar'`
    - `accionResenar(e: { authCargando: boolean; autenticado: boolean; pendientesCargando: boolean; consultadoConSesion: boolean | null; puedeResenar: boolean }): AccionResenar`
  - `usePendientesDeResena(autenticado: boolean)` conserva la firma. Su fetcher devuelve `{ conSesion: autenticado, items }`, y el hook expone además `consultadoConSesion: boolean | null` (`query.data?.conSesion ?? null`). `ids` no cambia, así que `AccountOrders` no se toca.
- Reglas de `accionResenar`, en este orden:
  1. `authCargando`, `pendientesCargando` o `consultadoConSesion !== autenticado` → `esperar`. Así se cubre el render en el que la sesión ya resolvió pero los pendientes siguen siendo los de invitado.
  2. `puedeResenar` → `abrir`.
  3. En otro caso → `descartar`.

- [ ] **Paso 1: escribir los tests que fallan**

```ts
const base = { authCargando: false, autenticado: true, pendientesCargando: false, consultadoConSesion: true, puedeResenar: true };
it('espera mientras carga la sesión', () => expect(accionResenar({ ...base, authCargando: true })).toBe('esperar'));
it('espera mientras cargan los pendientes', () => expect(accionResenar({ ...base, pendientesCargando: true })).toBe('esperar'));
it('espera si los pendientes son de la consulta de invitado', () =>
  expect(accionResenar({ ...base, consultadoConSesion: false })).toBe('esperar'));
it('abre si puede reseñar', () => expect(accionResenar(base)).toBe('abrir'));
it('descarta si no puede', () => expect(accionResenar({ ...base, puedeResenar: false })).toBe('descartar'));
it('invitado ya resuelto descarta', () =>
  expect(accionResenar({ ...base, autenticado: false, consultadoConSesion: false, puedeResenar: false })).toBe('descartar'));
```

- [ ] **Paso 2: comprobar que fallan**
Ejecuta `pnpm test src/app/lib/resenas.test.ts`. Esperado: FAIL, porque `accionResenar` no está definido.

- [ ] **Paso 3: implementar y conectar**
En `SeccionResenas`, toma `cargando` de `useAuth()`. El efecto, si hay `pidioResenar`:
- calcula `accionResenar(...)`;
- con `esperar`, retorna sin hacer nada;
- con `abrir`, abre el formulario;
- con `abrir` o `descartar`, hace scroll y borra el parámetro como hoy.

- [ ] **Paso 4: verificar**
Ejecuta `pnpm test && pnpm lint && pnpm typecheck`. Esperado: todo en verde.

- [ ] **Paso 5: commit**
```bash
git add src/app/lib/resenas.ts src/app/lib/resenas.test.ts src/app/hooks/useResenas.ts src/app/components/resenas/SeccionResenas.tsx
git commit -m "fix(resenas): abrir el formulario con ?resenar=1 solo cuando la sesión y los pendientes están resueltos"
```

---

### Task 7: "Mis pedidos" con `useApiQuery` [F-B5]

**Archivos:**
- Modificar: `src/app/pages/AccountOrders.tsx`

**Interfaces:**
- Consume: `useApiQuery<Paginado<Pedido>>((signal) => ordersApi.listar({ page, limit: LIMIT }, signal), [page])`.

- [ ] **Paso 1: sustituir el fetch manual**
Quita `pedidos`, `meta`, `cargando`, `error` y `cargarPedidos`. Usa `query.data?.data ?? []`, `query.data?.meta ?? null`, `query.loading` y `query.error`, y en `AvisoError` pon `onRetry={query.refetch}`. No hay test unitario porque es solo cableado de la página; el aborto ya está probado en el hook.

- [ ] **Paso 2: verificar**
Ejecuta `pnpm lint && pnpm typecheck`. Esperado: sin errores. Comprobación manual con `pnpm dev` en `/cuenta`, con más de 10 pedidos: pulsa «Siguiente» tres veces seguidas; la página mostrada coincide con el número de página.

- [ ] **Paso 3: commit**
```bash
git add src/app/pages/AccountOrders.tsx
git commit -m "fix(cuenta): paginar Mis pedidos con useApiQuery para descartar respuestas viejas"
```

---

### Task 8: `AdminProductos` con errores visibles, reversión y orden fuera del updater [F-B6]

**Archivos:**
- Crear: `src/app/admin/productos/orden-destacados.ts`, `src/app/admin/productos/orden-destacados.test.ts`
- Modificar: `src/app/admin/pages/AdminProductos.tsx`

**Interfaces:**
- Produce:
  - `moverEnOrden(ids: string[], activoId: string, sobreId: string): string[]`: usa `arrayMove` de `@dnd-kit/sortable`. Si alguno de los ids no está en la lista, devuelve `ids` sin cambios.
  - `cambiosDeOrden(idsEnOrden: string[], productos: Pick<ProductoAdmin, 'id' | 'destacadoOrden'>[]): { id: string; destacadoOrden: number }[]`: posiciones desde 1, solo las que cambian.

- [ ] **Paso 1: escribir los tests que fallan**

```ts
it('moverEnOrden mueve el activo a la posición del destino', () =>
  expect(moverEnOrden(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']));
it('moverEnOrden con id desconocido no cambia nada', () =>
  expect(moverEnOrden(['a', 'b'], 'z', 'a')).toEqual(['a', 'b']));
it('cambiosDeOrden solo devuelve las posiciones que cambian', () =>
  expect(cambiosDeOrden(['b', 'a', 'c'], [{ id: 'a', destacadoOrden: 1 }, { id: 'b', destacadoOrden: 2 }, { id: 'c', destacadoOrden: 3 }]))
    .toEqual([{ id: 'b', destacadoOrden: 1 }, { id: 'a', destacadoOrden: 2 }]));
```

- [ ] **Paso 2: comprobar que fallan**
Ejecuta `pnpm test src/app/admin/productos/orden-destacados.test.ts`. Esperado: FAIL, porque el módulo no existe.

- [ ] **Paso 3: implementar y conectar en `AdminProductos`**
  - Estado nuevo: `errorAccion: string`. Se muestra encima de la tabla como un aviso rojo (`text-red-400` sobre `bg-red-500/10`), con un botón «Cerrar» que lo vacía.
  - `toggleDisponible`: en `try/catch`. En el `catch`, `setErrorAccion(mensajeDeError(err, 'No se pudo cambiar la disponibilidad.'))` y la fila no cambia.
  - `eliminar`: en `try/catch`. En el `catch`, el modal sigue abierto y muestra el mensaje de `mensajeDeError(err, 'No se pudo eliminar el producto.')` dentro del propio modal (estado `errorEliminar`, que se limpia al abrir o cerrar el modal).
  - `toggleDestacado`: en su `.catch`, además de revertir, llama a `setErrorAccion('No se pudo actualizar el destacado.')`.
  - `handleDragEnd`: guarda `const anterior = ordenIds`, calcula `const next = moverEnOrden(ordenIds, String(active.id), String(over.id))`, hace `setOrdenIds(next)` y luego `void persistirOrden(next, anterior)`. Fuera del updater no queda ninguna llamada a `persistirOrden`.
  - `persistirOrden(idsEnOrden: string[], anterior: string[])` usa `cambiosDeOrden`. En el `catch`: `setOrdenIds(anterior)`, `productosQuery.refetch()` (que resincroniza las escrituras parciales) y `setErrorAccion('No se pudo guardar el orden de destacados. Se recargó la lista.')`.

- [ ] **Paso 4: verificar**
Ejecuta `pnpm test && pnpm lint && pnpm typecheck`. Esperado: todo en verde. Comprobación manual: con la API parada, eliminar un producto deja el modal abierto con el mensaje.

- [ ] **Paso 5: commit**
```bash
git add src/app/admin/productos src/app/admin/pages/AdminProductos.tsx
git commit -m "fix(admin): manejar errores en productos, revertir el orden y sacar efectos del updater"
```

---

### Task 9: `destinoSeguro` valida con `URL` y el mismo origen [F-B9]

**Archivos:**
- Modificar: `src/app/lib/volver.ts`
- Test: `src/app/lib/volver.test.ts` (de la Fase 0)

**Interfaces:**
- Produce: `destinoSeguro(valor: string | null | undefined, origen: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'): string`. Los llamadores actuales no cambian. Devuelve `url.pathname + url.search + url.hash`, o `'/catalog'`.

- [ ] **Paso 1: escribir los tests que fallan**

```ts
const O = 'https://tienda.test';
it.each(['/\t/evil.com', '/\n/evil.com', '/\\evil.com', '//evil.com', 'https://evil.com', 'javascript:alert(1)', '/login', '/reset-password?x=1'])(
  'rechaza %j', (v) => expect(destinoSeguro(v, O)).toBe('/catalog'));
it('conserva ruta, query y fragmento internos', () =>
  expect(destinoSeguro('/product/1?resenar=1#resenas', O)).toBe('/product/1?resenar=1#resenas'));
```

- [ ] **Paso 2: comprobar que fallan**
Ejecuta `pnpm test src/app/lib/volver.test.ts`. Esperado: FAIL en los casos `'/\t/evil.com'` y `'/\n/evil.com'`.

- [ ] **Paso 3: implementar**
Si `!valor` o el valor no empieza por `/`, devuelve el destino por defecto. Si no, hace `new URL(valor, origen)` dentro de `try`. Rechaza si `url.origin !== origen` o si `url.pathname` está en `RUTAS_DE_ACCESO`.

- [ ] **Paso 4: verificar**
Ejecuta `pnpm test && pnpm typecheck`. Esperado: todo en verde.

- [ ] **Paso 5: commit**
```bash
git add src/app/lib/volver.ts src/app/lib/volver.test.ts
git commit -m "fix(volver): validar el destino con URL y el mismo origen"
```

---

### Task 10: verificación de la fase

- [ ] **Paso 1: suite completa**
Ejecuta `pnpm test && pnpm lint && pnpm typecheck && pnpm build`. Esperado: todo en verde y el build sin errores.

- [ ] **Paso 2: recorrido manual con `pnpm dev` contra la API local** (marca cada punto)
  - Contraentrega: la confirmación muestra número y total del backend. Un doble envío con la red cortada a mitad (DevTools en *Offline* tras enviar, y reintentar) no crea dos pedidos con la API de la Fase 3.
  - MercadoPago en sandbox: al pagar con una tarjeta rechazada, se llega a `/checkout/failure` con el carrito intacto y el CTA «Volver al checkout». Al aprobar el segundo intento, `/checkout/success` vacía el carrito.
  - Abrir `/checkout/success` en una pestaña nueva con artículos en el carrito y sin `c3lect-pending-checkout`: el carrito no se vacía.
  - Con la sesión iniciada, borrar `refreshToken` y estropear `accessToken` en `sessionStorage`, y recargar `/product/<id>`: se queda en la ficha y el menú muestra «Ingresar». Lo mismo en `/cuenta`: redirige a `/login?volver=%2Fcuenta`.
  - Cerrar sesión: el carrito queda vacío y desaparecen `c3lect-cart` y `c3lect-pending-checkout`.
  - Ocultar en el admin un producto que está en el carrito: el carrito lo marca y el checkout no lo incluye.

No hay commit en esta tarea, salvo los arreglos que salgan del recorrido (cada uno con su propio commit `fix(...)`).
