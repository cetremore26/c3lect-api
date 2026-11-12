# Caso de uso: checkout pendiente y webhook de MercadoPago

> **Estado:** comportamiento implementado; el proveedor externo y su disponibilidad no se verificaron desde este workspace.

## Punto de entrada

- `POST /payments/create-pending` — JWT opcional. Recibe items, datos de envío
  y cookies opcionales `_fbp`/`_fbc`.
- `POST /payments/webhook` — público, sin throttling; recibe notificación,
  `x-signature` y `x-request-id`. El controller responde inmediatamente y
  procesa el caso de uso en segundo plano.

## Flujo implementado

```mermaid
flowchart TD
    A[Cliente / checkout] --> B[PaymentsController]
    B --> C[CreatePendingOrderPaymentUseCase]
    C --> D[OrdersPort.cotizar]
    D --> E[Catálogo + promociones + inventario]
    E --> F[MercadoPagoPaymentGateway.createPreference]
    F --> G[PaymentRepository.create<br/>estado PENDIENTE + draftPayload]
    G --> H[checkoutUrl, preferenceId, paymentId]

    M[MercadoPago webhook] --> N[PaymentsController]
    N --> O[responde {received:true}]
    N --> P[HandleWebhookUseCase asíncrono]
    P --> Q{type === payment?}
    Q -- No --> R[Ignorar]
    Q -- Sí --> S{firma x-signature válida?}
    S -- No --> R
    S -- Sí --> T[Gateway.getPayment]
    T --> U[mapEstadoPago + external_reference]
    U --> V[markProcessedIfNotTerminal]
    V --> W{estado}
    W -- APROBADO --> X[crear/confirmar pedido]
    W -- RECHAZADO o CANCELADO --> Y[Cancelar solo flujo legado con pedido]
    W -- PENDIENTE --> Z[Sin efecto adicional]
    X --> AA[PedidoConfirmado en transacción]
    AA --> AB[PagoAprobado después del commit]
    X --> AC[PagoSinPedido si no puede materializar]
```

## Creación de pago pendiente

1. `CreatePendingOrderPaymentUseCase` cotiza los items mediante la fachada de
   pedidos, incluyendo datos de catálogo, inventario y promociones.
2. Genera un número de pedido, pero no crea todavía un `Order`.
3. Crea una preferencia en MercadoPago con items, total, email del pagador y el
   número como `externalReference`.
4. Persiste `Payment` en estado `PENDIENTE`, sin `orderId`, incluyendo
   `draftPayload` con items cotizados, shipping, usuario y cookies Meta.
5. Devuelve URL de checkout, preference ID y payment ID.

## Procesamiento del webhook

El controller retorna `200` con `{ received: true }` antes de esperar al
proveedor. El caso de uso ignora tipos distintos de `payment`, rechaza headers
de firma ausentes, valida la firma HMAC mediante
`verifyMpWebhookSignature`, consulta el pago en MercadoPago y busca el payment
local por `externalReference`.

`markProcessedIfNotTerminal` hace el guard de idempotencia: si otra entrega ya
dejó el registro en estado terminal, el caso no repite efectos. Para
`APROBADO`, el flujo nuevo materializa el pedido desde `draftPayload` y lo
confirma; el flujo legado puede confirmar un pedido PENDIENTE existente. Para
`RECHAZADO` o `CANCELADO`, solo se cancela el pedido del flujo legado, porque en
el flujo nuevo aún no existe un pedido.

Si un pago aprobado no puede crear o confirmar el pedido, se publica
`PagoSinPedido` para notificación y atención. El código no revierte el cobro
externo.

## Efectos posteriores

`PedidoConfirmado` se publica dentro de la unidad de trabajo. Sus suscriptores
`in-transaction` descuentan stock y registran ventas; un rechazo de inventario
revierte la transacción. `PagoAprobado` se publica después de la materialización
y los suscriptores `after-commit` generan correo, comprobante PDF y conversión
de Meta cuando está configurada.

## Evidencia

[`payments.controller.ts`](../../src/modules/payments/infrastructure/http/payments.controller.ts),
los cuatro casos de uso de `payments`, el gateway MercadoPago, el repositorio de
pagos, `CreateConfirmedOrderUseCase`, eventos de pedidos/pagos y suscriptores
de inventario, ventas, notificaciones y Meta.
