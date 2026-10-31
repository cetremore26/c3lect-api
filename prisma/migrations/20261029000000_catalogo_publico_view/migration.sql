-- Contrato público del catálogo (fase "expand").
--
-- La tienda lee el catálogo directo de Supabase con la clave anon (para no
-- depender de que la API de Render esté despierta). Antes leía las tablas
-- `productos` y `promociones` y replicaba en el navegador tres reglas del
-- backend: qué producto se muestra, cómo se cruza con inventario y cuál es su
-- precio con promoción. Esta vista es ahora el único contrato entre la tienda y
-- la base: columnas explícitas, reglas resueltas aquí, y el frontend deja de
-- conocer el esquema interno.
--
-- Es un modelo de lectura (como metrics/read-model): lee productos,
-- inventario_maestro y promociones, nunca escribe. Corre con los privilegios
-- de su dueño (security_invoker = false) a propósito: así anon puede leer la
-- vista sin tener acceso a las tablas base, que se le quita en la fase
-- "contract" (prisma/pending-migrations/).
--
-- GEMELOS — si cambia alguna de estas reglas, cambiar ambos lados:
--   modelo derivado → src/shared/domain/marca-modelo.util.ts (deriveMarcaModeloFromProduct)
--   búsqueda de stock → inventario.repository.ts (buscarPorModelo)
--   descuento        → src/modules/promotions/domain/promotions.util.ts (mejorDescuento, calcularPrecioFinal)
-- La paridad la verifica src/modules/products/infrastructure/persistence/catalogo-publico.int-spec.ts.

CREATE VIEW "public"."catalogo_publico" WITH (security_invoker = false) AS
WITH visibles AS (
  SELECT
    p.*,
    CASE
      WHEN p.marca IS NOT NULL
        AND left(lower(p.nombre), length(p.marca)) = lower(p.marca)
        AND btrim(substr(p.nombre, length(p.marca) + 1), E' \t\n\r') <> ''
      THEN btrim(substr(p.nombre, length(p.marca) + 1), E' \t\n\r')
      ELSE p.nombre
    END AS modelo_derivado,
    -- Algunos perfumes importados de la planilla tienen estilo "N/A".
    (btrim(p.estilo) = '' OR upper(btrim(p.estilo)) = 'N/A') AS estilo_vacio
  FROM "public"."productos" p
  -- Solo productos completos: con precio, estilo e imágenes.
  WHERE p.precio > 0
    AND p.estilo <> ''
    AND cardinality(p.imgs) > 0
),
con_stock AS (
  SELECT
    v.*,
    COALESCE(
      (SELECT i.stock FROM "public"."inventario_maestro" i
        WHERE lower(i.modelo) = lower(v.modelo_derivado) LIMIT 1),
      -- Fallback legado: filas de inventario aún sin marca/modelo separados.
      CASE WHEN lower(v.modelo_derivado) <> lower(v.nombre) THEN
        (SELECT i.stock FROM "public"."inventario_maestro" i
          WHERE lower(i.modelo) = lower(v.nombre) LIMIT 1)
      END
    ) AS stock
  FROM visibles v
),
con_descuento AS (
  SELECT
    s.*,
    d.descuento_invitado,
    d.descuento_cuenta
  FROM con_stock s
  CROSS JOIN LATERAL (
    -- Mejor promoción vigente que aplica (nunca se acumulan). Las de
    -- solo_cuenta_activa solo cuentan para compradores con sesión.
    SELECT
      COALESCE(MAX(pr.porcentaje) FILTER (WHERE NOT pr.solo_cuenta_activa), 0) AS descuento_invitado,
      COALESCE(MAX(pr.porcentaje), 0) AS descuento_cuenta
    FROM "public"."promociones" pr
    WHERE pr.activo
      AND now() >= pr.fecha_inicio
      AND now() <= pr.fecha_fin
      AND NOT (s.id = ANY (pr.excluidos))
      AND CASE pr.alcance::text
        WHEN 'TODOS' THEN true
        WHEN 'CATEGORIA' THEN pr.categoria IS NOT NULL AND pr.categoria = s.cat
        WHEN 'MARCA' THEN pr.marca IS NOT NULL AND pr.marca = s.marca
        WHEN 'PRODUCTO' THEN s.id = ANY (pr.productos_incluidos)
        ELSE false
      END
  ) d
)
SELECT
  c.id,
  c.nombre,
  CASE WHEN c.estilo_vacio THEN '' ELSE c.estilo END AS estilo,
  CASE WHEN c.estilo_vacio THEN c.nombre ELSE c.display END AS display,
  c.precio,
  c.disponible,
  c.destacado,
  c.destacado_orden,
  c.cat,
  c.marca,
  c.genero,
  c.imgs,
  c.spec_movimiento,
  c.spec_dimensiones,
  c.spec_caja,
  c.spec_correa,
  c.spec_cristal,
  c.spec_funciones,
  c.spec_resistencia_agua,
  c.spec_peso,
  c.spec_bateria,
  c.spec_reserva_marcha,
  c.spec_observaciones,
  c.notas_descripcion,
  c.notas_top,
  c.notas_corazon,
  c.notas_base,
  c.stock,
  c.descuento_invitado,
  c.descuento_cuenta,
  CASE WHEN c.descuento_invitado <= 0 THEN c.precio
       ELSE round(c.precio * (1 - c.descuento_invitado / 100.0))::int END AS precio_final_invitado,
  CASE WHEN c.descuento_cuenta <= 0 THEN c.precio
       ELSE round(c.precio * (1 - c.descuento_cuenta / 100.0))::int END AS precio_final_cuenta
FROM con_descuento c;

COMMENT ON VIEW "public"."catalogo_publico" IS
  'Contrato público del catálogo para la tienda (Supabase anon). Ver migración 20261029000000.';

-- Los roles anon/authenticated solo existen en Supabase; en un Postgres local
-- o de CI la migración debe aplicar igual.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON "public"."catalogo_publico" TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON "public"."catalogo_publico" TO authenticated;
  END IF;
END
$$;
