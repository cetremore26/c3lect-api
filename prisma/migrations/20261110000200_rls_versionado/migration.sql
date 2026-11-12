-- RLS y privilegios de Supabase versionados.
-- La API se conecta como dueño de las tablas (RLS no le aplica); anon y
-- authenticated, los roles de la API REST/PostgREST de Supabase, no deben
-- tocar nada interno. Hasta ahora esto estaba hecho a mano en producción:
-- una base recreada desde las migraciones quedaba abierta. Idempotente.

-- 1. RLS en todas las tablas de public (sin políticas: nadie salvo el dueño
--    y los roles que la saltan). Funciona también sin los roles de Supabase.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- 2. Políticas antiguas de lectura pública, creadas a mano en Supabase.
--    La lectura pública pasa por las vistas, no por las tablas.
DROP POLICY IF EXISTS "Lectura pública de productos" ON "public"."productos";
DROP POLICY IF EXISTS "Lectura pública de promociones" ON "public"."promociones";

-- 3. Privilegios de anon y authenticated: ninguno sobre tablas; solo SELECT
--    en las dos vistas públicas. Los roles solo existen en Supabase (o en una
--    base local que los emule); sin ellos la migración aplica igual.
DO $$
DECLARE
  rol text;
  t text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM %I', t, rol);
      END LOOP;

      EXECUTE format('REVOKE ALL ON public.catalogo_publico FROM %I', rol);
      EXECUTE format('REVOKE ALL ON public.resenas_publicas FROM %I', rol);
      EXECUTE format('GRANT SELECT ON public.catalogo_publico TO %I', rol);
      EXECUTE format('GRANT SELECT ON public.resenas_publicas TO %I', rol);

      -- Tablas futuras creadas por el rol que ejecuta la migración.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', rol);

      -- En Supabase las tablas las crea `postgres`; si la migración corre con
      -- otro rol (local: el dueño), se cubre `postgres` solo si existe y se
      -- puede alterar. Si no, se omite sin error.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
         AND current_user <> 'postgres' THEN
        BEGIN
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM %I', rol);
        EXCEPTION WHEN insufficient_privilege THEN
          RAISE NOTICE 'sin permiso para alterar privilegios por defecto de postgres; se omite';
        END;
      END IF;
    END IF;
  END LOOP;
END
$$;
