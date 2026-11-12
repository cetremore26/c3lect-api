import { Pool } from 'pg';

// Test de integración: las migraciones dejan RLS activo en todas las tablas de
// `public` y a los roles de Supabase (anon/authenticated) sin privilegios
// salvo SELECT en las dos vistas públicas. Solo lee el catálogo.
//
//   INTEGRATION_DATABASE_URL=postgresql://... pnpm test:int
//
// Sin la variable, se omite. NUNCA apuntarla a producción.
const url = process.env.INTEGRATION_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('RLS y privilegios de Supabase (migración)', () => {
  let pool: Pool;
  let hayRoles = false;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`,
    );
    hayRoles = rows[0].n === 2;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('todas las tablas de public tienen RLS', async () => {
    const { rows } = await pool.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('anon/authenticated solo tienen SELECT en las dos vistas', async () => {
    if (!hayRoles) return;
    const { rows } = await pool.query<{ n: number }>(
      `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
         AND NOT (table_name IN ('catalogo_publico', 'resenas_publicas') AND privilege_type = 'SELECT')
       ORDER BY 1, 2, 3`,
    );
    expect(rows).toEqual([]);
  });
});
