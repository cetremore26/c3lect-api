# Arquitectura: C3LECT API

> **Estado:** vista lógica verificada por inspección de código; despliegue actual reportado/configurado; infraestructura AWS propuesta. **Fecha:** 2026-11-11.

## Propósito y dominio

C3LECT API soporta el backend de un comercio electrónico de relojería y
perfumería de alta gama. Sus capacidades implementadas incluyen catálogo,
promociones, cuentas, autenticación, checkout de invitados/autenticados,
MercadoPago, inventario, costos, compras, ventas, gastos, reseñas, auditoría y
métricas administrativas. La afirmación se apoya en los controllers, servicios,
modelo Prisma y la descripción de [`README.md`](../../README.md), corroborados
con [`src/app.module.ts`](../../src/app.module.ts) y los módulos en
`src/modules/`.

## Alcance y evidencia

### Fuentes inspeccionadas

- `src/main.ts`, `src/app.module.ts`, `src/app.controller.ts`.
- Controllers, módulos, fachadas, casos de uso, adaptadores, repositorios y
  suscriptores en `src/modules/`.
- Shared kernel en `src/shared/`.
- `prisma/schema.prisma` y migraciones, incluyendo las vistas públicas.
- `README.md`, `ARCHITECTURE.md`, `package.json` y `.github/workflows/ci.yml`.
- Pruebas unitarias, de composición y de arquitectura.

### Clasificación

| Estado | Uso en este documento |
|---|---|
| **Verificado** | Confirmado directamente en código, pruebas o esquema. |
| **Configurado** | Presente en configuración/variables, pero no probado en una ejecución remota. |
| **Documentado** | Declarado en README/ARCHITECTURE y consistente con el código inspeccionado. |
| **Reportado** | Host o enlace indicado por la documentación del proyecto; no se hizo comprobación remota. |
| **Inferido** | Interpretación de relaciones que no tienen un artefacto de despliegue explícito. |
| **Propuesto** | Diseño AWS solicitado implícitamente por el paquete completo de arquitectura; no describe el hosting actual. |
| **Desconocido** | No existe evidencia suficiente en este repositorio. |

No se inspeccionó el repositorio del frontend enlazado desde el README, no se
ejecutó una instancia de la API ni se contactaron servicios externos. La
experiencia visual de la tienda es, por tanto, evidencia externa/documentada y
no una capacidad verificada de este workspace.

## Contexto del sistema

El navegador/frontend externo consume la API REST y, según
`ARCHITECTURE.md`, puede leer vistas públicas de catálogo y reseñas directamente
desde Supabase. La API recibe peticiones públicas y autenticadas, usa
PostgreSQL mediante Prisma, y se integra con MercadoPago, Resend y Meta CAPI.
Los módulos internos se comunican por fachadas públicas para consultas y por
eventos de dominio para efectos.

## Componentes y responsabilidades

| Componente | Responsabilidad | Evidencia / estado |
|---|---|---|
| `main.ts` / `AppModule` | Bootstrap NestJS, composición de módulos, guards globales, Swagger, CORS, Helmet, validación y cierre. | **Verificado** — `src/main.ts`, `src/app.module.ts`. |
| Controllers HTTP | Adaptan rutas, DTOs, guards y roles a servicios/casos de uso. | **Verificado** — `src/modules/*/infrastructure/http`. |
| Identidad | Registro, login, OTP, reset, refresh/logout, usuarios y cuenta. | **Verificado** — `auth`, `users`, `account`. |
| Catálogo | Productos, promociones, marcas, filtros, disponibilidad y auditoría de mutaciones. | **Verificado** — `products`, `promotions`, `marcas`. |
| Pedidos | Cotización, checkout, pedidos de invitados/autenticados, permisos y estados. | **Verificado** — `orders`. |
| Pagos | Preferencias y estados MercadoPago, webhook firmado, idempotencia y voucher PDF. | **Verificado** — `payments`. |
| Operaciones | Inventario, precios, compras, ventas, gastos, métricas y auditoría. | **Verificado** — módulos operativos. |
| Reseñas | Validación de compra entregada, creación, moderación y respuestas. | **Verificado** — `resenas` y migración 20261105000000. |
| Shared kernel | Prisma, host transaccional, bus de eventos, errores, auth guards y puertos. | **Verificado** — `src/shared`. |
| Notifications | Suscripción a eventos y correo transaccional vía Resend. | **Verificado/configurado** — no tiene controller ni tablas propias. |
| Meta Conversions | Suscripción a compras/ventas y envío opcional a Meta CAPI. | **Verificado/configurado** — credenciales opcionales. |
| PostgreSQL | Persistencia de modelos Prisma, migraciones y vistas públicas. | **Verificado/configurado** — no se validó una instancia remota. |

## Diagrama de componentes

Los dos artefactos siguientes describen la misma vista lógica y no contienen
regiones, subredes ni servicios cloud:

- [Mermaid](component-diagram.mmd)
- [Draw.io editable](component-diagram.drawio)

El frontend y los proveedores externos están fuera del límite lógico del
backend. La separación por módulos representa responsabilidades y relaciones
observadas; no implica que cada contexto sea un proceso desplegable separado.

## Rutas de integración y eventos

### Petición síncrona

`controller → application service/use case → port → adapter/repository →
Prisma/PostgreSQL → response`. El controller no accede directamente a Prisma.
Los casos de uso usan fachadas públicas de otros contextos cuando necesitan
consultas.

### Eventos transaccionales

El bus en memoria distingue dos fases:

- **`in-transaction`:** efectos que deben participar en el rollback. Por ejemplo,
  `PedidoConfirmado` activa inventario y luego ventas; si el stock falla, la
  creación se revierte.
- **`after-commit`:** correo, comprobante y Meta. No se envían por una operación
  que terminó en rollback y sus errores no derriban la respuesta principal.

La relación se implementa en los suscriptores de `orders`, `inventario`,
`ventas`, `notifications`, `precios` y `meta-conversions`, y se verifica en
`src/app.module.spec.ts`.

## Datos y persistencia

Prisma mapea PostgreSQL a tablas de identidad, catálogo, pedidos, pagos,
inventario, precios, compras, ventas, gastos, promociones, reseñas y auditoría.
Las relaciones principales son `User → Order → OrderItem`, `Order → Payment`,
`Order → ShippingInfo`, `Product → Promotion` por reglas de aplicación y
`Resena → User`.

`catalogo_publico` y `resenas_publicas` son vistas de lectura para el frontend
externo; la migración `20261029000100` revoca acceso público a tablas privadas
del catálogo y la migración `20261105000000` hace lo mismo con `resenas`.
Esto está documentado en `ARCHITECTURE.md` y definido en las migraciones; la
configuración efectiva de Supabase no se comprobó en remoto.

## Despliegue e infraestructura

### Estado actual reportado

El README reporta la API en Render, una base/lecturas públicas en Supabase y el
frontend en GitHub Pages. `main.ts` contiene configuración específica de un hop
de proxy de Render y `FRONTEND_URL` admite un path de GitHub Pages. Esta vista
está separada en [current-deployment.drawio](current-deployment.drawio) y se
clasifica como **reportada/configurada**, no como prueba de disponibilidad.

### AWS propuesto

No se suministró proveedor objetivo. Conforme al alcance estándar de esta
documentación, [aws-infrastructure.drawio](aws-infrastructure.drawio) muestra
una topología **PROPOSED** con API Gateway, ECS, RDS PostgreSQL, Secrets Manager
y CloudWatch. Cuenta, región, VPC y subredes están marcadas `TBD`; no se
inventan valores. Los sistemas externos permanecen fuera del boundary AWS.

#### Inventario de iconos AWS

| Servicio | Notación usada | Fuente/razón |
|---|---|---|
| Amazon API Gateway | `mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway` | Identificador listado en la guía AWS4 instalada; visual no inspeccionada. |
| Amazon ECS | `mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecs` | Identificador listado en la guía AWS4 instalada; visual no inspeccionada. |
| Amazon RDS for PostgreSQL | `mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds` | Identificador listado en la guía AWS4 instalada; visual no inspeccionada. |
| AWS Secrets Manager | `mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.secrets_manager` | Identificador listado en la guía AWS4 instalada; visual no inspeccionada. |
| Amazon CloudWatch | `mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudwatch_2` | Identificador listado en la guía AWS4 instalada; visual no inspeccionada. |

No se agregaron colas, CDN, almacenamiento de objetos ni servicios de alta
disponibilidad porque no hay evidencia de que la aplicación los use y no son
necesarios para expresar la propuesta mínima.

## Seguridad

Confirmado en código: JWT/Passport, refresh tokens hashados, Argon2,
`RolesGuard`, `OptionalJwtAuthGuard`, validación global, Helmet, CORS por origen,
throttling, verificación HMAC del webhook, filtro global de errores de dominio y
auditoría de mutaciones. Los secrets se reciben por configuración de entorno.

No hay evidencia suficiente en este workspace para afirmar cifrado administrado,
rotación de secretos, WAF, backup, retención de logs, objetivos de disponibilidad
o cumplimiento normativo. Los elementos de seguridad de la vista AWS son
propuestos y no representan controles actuales.

## Operación y entrega

El endpoint de salud consulta PostgreSQL. CI ejecuta pruebas, compilación y lint
no bloqueante en GitHub Actions. El código configura cierre ordenado y el bus de
eventos maneja errores `after-commit` sin bloquear la respuesta. No hay
manifiestos de infraestructura, observabilidad remota ni objetivos SLO en el
repositorio.

## Decisiones y brechas de evidencia

- El monolito modular mantiene contextos separados sin exigir despliegues
  independientes; la prueba de arquitectura protege sus límites.
- El pago pendiente evita crear pedidos huérfanos antes de la aprobación.
- La confirmación del pedido y el descuento de stock comparten la transacción.
- El frontend externo y sus vistas públicas deben revisarse junto con este
  backend para validar el contrato de catálogo/reseñas de extremo a extremo.
- Falta evidencia de proveedor/region/account objetivo si la propuesta AWS debe
  convertirse en diseño ejecutable.
- Falta ejecución remota para validar disponibilidad y latencia del despliegue
  reportado.

## Índice de diagramas y validación

- Componente: [component-diagram.mmd](component-diagram.mmd)
- Componente editable: [component-diagram.drawio](component-diagram.drawio)
- Infraestructura AWS propuesta: [aws-infrastructure.drawio](aws-infrastructure.drawio)
- Despliegue actual reportado: [current-deployment.drawio](current-deployment.drawio)
- Archify: no se creó; no hay `archify/SKILL.md` instalado en el catálogo local.

### Validación

- `check_drawio.py` ejecutado con Python sobre los tres archivos: **0 errores y
  0 warnings** en cada archivo.
- La infraestructura AWS se verificó además con
  `--require-provider-icons aws`: **5 iconos AWS4 reconocidos**.
- Se hizo validación manual adicional con el parser XML de PowerShell: IDs
  únicos y todos los endpoints de las 41 aristas resueltos.
- La sintaxis JavaScript embebida de Blueprint y presentación se analizó con
  `node/vm.Script`: **PASS**.
- La inspección visual en Draw.io y navegador no se ejecutó: no se solicitó
  renderizado y no hay navegador Desktop disponible en este entorno. El pase
  estático no equivale a una validación visual.
