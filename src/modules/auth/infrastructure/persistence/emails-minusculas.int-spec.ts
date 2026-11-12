import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

// Test de integración contra una base local. Sin la variable, se omite.
// NUNCA apuntarla a producción. Cada test corre dentro de BEGIN ... ROLLBACK.
const url = process.env.INTEGRATION_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('migración emails_minusculas', () => {
  let db: Client;
  let sql: string;

  const insertar = (email: string) =>
    db.query(
      'INSERT INTO users (id, email, nombre, updated_at) VALUES ($1, $2, $3, now())',
      [randomUUID(), email, 'Test'],
    );

  beforeAll(async () => {
    sql = readFileSync(
      join(
        __dirname,
        '../../../../../prisma/migrations/20261110000100_emails_minusculas/migration.sql',
      ),
      'utf8',
    );
    db = new Client({ connectionString: url });
    await db.connect();
  });

  beforeEach(async () => {
    await db.query('BEGIN');
  });

  afterEach(async () => {
    await db.query('ROLLBACK');
  });

  afterAll(async () => {
    await db.end();
  });

  it('aborta si dos emails colisionan sin mayúsculas', async () => {
    await insertar('Dup@Test.local');
    await insertar('dup@test.local');
    await expect(db.query(sql)).rejects.toThrow(/duplicados/i);
  });

  it('pasa los emails a minúsculas y sin espacios', async () => {
    await insertar(' Mixto@Test.LOCAL');
    await db.query(sql);
    const { rows } = await db.query(
      "SELECT email FROM users WHERE lower(trim(email)) = 'mixto@test.local'",
    );
    expect(rows).toEqual([{ email: 'mixto@test.local' }]);
  });
});
