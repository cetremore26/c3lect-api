-- Fase "contract" del contrato público del catálogo.
--
-- Aplicada después de desplegar el frontend que lee la vista; aplicarla con la tienda vieja
-- en producción la rompía (esa versión leía las tablas directo). Orden seguido:
--   1. Aplicar 20261029000000_catalogo_publico_view (crea la vista).
--   2. Desplegar el frontend que lee `catalogo_publico`.
--   3. Mover esta carpeta a prisma/migrations/ y correr `prisma migrate deploy`.
--
-- Desde aquí, la clave anon del navegador solo puede leer la vista: ni
-- columnas internas futuras de productos (costos, márgenes), ni promociones
-- inactivas o programadas, ni filas que el catálogo no publica.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "public"."productos" FROM anon;
    REVOKE ALL ON "public"."promociones" FROM anon;
    REVOKE ALL ON "public"."inventario_maestro" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "public"."productos" FROM authenticated;
    REVOKE ALL ON "public"."promociones" FROM authenticated;
    REVOKE ALL ON "public"."inventario_maestro" FROM authenticated;
  END IF;
END
$$;
