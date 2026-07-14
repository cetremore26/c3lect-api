-- La tabla _prisma_migrations la crea Prisma automáticamente y no está modelada en
-- schema.prisma, por eso esta migración es SQL manual en vez de un diff generado.
--
-- Habilita RLS sin ninguna política (deny-by-default) para que quede inaccesible vía
-- la API pública de Supabase (anon/authenticated). No afecta a Prisma Migrate ni al
-- backend: ambos se conectan con el rol dueño de la tabla, que RLS no restringe salvo
-- que se use FORCE ROW LEVEL SECURITY (no es el caso aquí).
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
