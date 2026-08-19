-- Enable trigram support: required for indexing case-insensitive (ILIKE) lookups
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
-- "cat" is filtered with Prisma's `mode: 'insensitive'`, which Postgres executes as ILIKE.
-- A plain btree index (as suggested by Supabase's Index Advisor) is never used by the
-- planner for ILIKE, so a GIN trigram index is used instead.
CREATE INDEX "productos_cat_trgm_idx" ON "productos" USING GIN ("cat" gin_trgm_ops);

-- CreateIndex
-- Same issue applies to "marca" and "genero", which are filtered the same way.
CREATE INDEX "productos_marca_trgm_idx" ON "productos" USING GIN ("marca" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "productos_genero_trgm_idx" ON "productos" USING GIN ("genero" gin_trgm_ops);
