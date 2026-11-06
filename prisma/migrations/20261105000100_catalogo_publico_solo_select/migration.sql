-- catalogo_publico: anon y authenticated solo leen.
--
-- La migración 20261029000000 hizo GRANT SELECT sobre la vista pero no quitó
-- antes los privilegios que Supabase concede por defecto sobre objetos nuevos
-- de public, así que anon/authenticated quedaron con INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES y TRIGGER. Hoy no eran explotables (una vista con WITH
-- no es actualizable en Postgres), pero el contrato es de solo lectura y debe
-- decirlo en los permisos, no depender de la forma del SQL. Mismo patrón que
-- resenas_publicas (20261105000000).
-- Los roles solo existen en Supabase; en un Postgres local o de CI la
-- migración aplica igual.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "public"."catalogo_publico" FROM anon;
    GRANT SELECT ON "public"."catalogo_publico" TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "public"."catalogo_publico" FROM authenticated;
    GRANT SELECT ON "public"."catalogo_publico" TO authenticated;
  END IF;
END
$$;
