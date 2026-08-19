-- Supabase Security Advisor flags extensions installed in `public` as a risk
-- (public is writable/exposed by default). Move pg_trgm into the dedicated
-- `extensions` schema, matching Supabase's convention for pgcrypto, uuid-ossp, etc.
-- pg_trgm is relocatable, so this preserves the existing gin_trgm_ops indexes
-- on productos(cat/marca/genero) without dropping or rebuilding them.
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
