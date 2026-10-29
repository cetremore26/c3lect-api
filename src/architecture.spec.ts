import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

// Reglas de la arquitectura (ver ARCHITECTURE.md), verificadas sobre el
// código real. Si una falla, el mensaje dice qué archivo rompe qué regla.

const SRC = __dirname;

interface SourceFile {
  /** Ruta relativa a src/, con '/'. */
  path: string;
  content: string;
  imports: string[];
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = join(dir, d.name);
    if (d.isDirectory()) return walk(full);
    // Los tests (.spec.ts / .int-spec.ts) no son código de producción.
    return d.name.endsWith('.ts') && !/[.-]spec\.ts$/.test(d.name)
      ? [full]
      : [];
  });
}

const toPosix = (p: string) => p.split(sep).join('/');

const files: SourceFile[] = walk(SRC)
  .map((full) => {
    const content = readFileSync(full, 'utf8');
    const imports = [...content.matchAll(/from\s+'([^']+)'/g)].map((m) => {
      const spec = m[1];
      return spec.startsWith('.')
        ? toPosix(relative(SRC, resolve(dirname(full), spec)))
        : spec;
    });
    return { path: toPosix(relative(SRC, full)), content, imports };
  })
  .filter((f) => !f.path.startsWith('shared/testing/'));

const moduleOf = (path: string) => /^modules\/([^/]+)\//.exec(path)?.[1];
const layerOf = (path: string) =>
  /^modules\/[^/]+\/(domain|application|infrastructure)\//.exec(path)?.[1];
const isRelative = (imp: string) => !imp.startsWith('@') && imp.includes('/');

function violations(
  check: (file: SourceFile, imp: string) => boolean,
  scope: (file: SourceFile) => boolean = () => true,
): string[] {
  return files
    .filter(scope)
    .flatMap((f) =>
      f.imports
        .filter((imp) => check(f, imp))
        .map((imp) => `${f.path} → ${imp}`),
    );
}

describe('Arquitectura', () => {
  it('encuentra los archivos fuente', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  describe('regla de dependencia (las flechas apuntan hacia adentro)', () => {
    it('domain no depende de frameworks, ORM, ni de capas externas', () => {
      const prohibidos = [
        /^@nestjs\//,
        /^@prisma\//,
        /^class-validator$/,
        /^class-transformer$/,
      ];
      expect(
        violations(
          (_, imp) =>
            prohibidos.some((p) => p.test(imp)) ||
            (isRelative(imp) &&
              /\/(application|infrastructure)\//.test(`/${imp}`)),
          (f) =>
            layerOf(f.path) === 'domain' || f.path.startsWith('shared/domain/'),
        ),
      ).toEqual([]);
    });

    it('application no depende de infraestructura, ORM ni de otros módulos', () => {
      expect(
        violations(
          (f, imp) => {
            if (/^@prisma\//.test(imp)) return true;
            if (/^@nestjs\/(?!common$)/.test(imp)) return true;
            if (!isRelative(imp)) return false;
            if (/(^|\/)infrastructure\//.test(imp)) return true;
            const destino = moduleOf(imp);
            return destino !== undefined && destino !== moduleOf(f.path);
          },
          (f) =>
            layerOf(f.path) === 'application' ||
            f.path.startsWith('shared/application/'),
        ),
      ).toEqual([]);
    });

    it('application solo usa de @nestjs/common los decoradores de DI y el Logger', () => {
      const permitidos = new Set(['Inject', 'Injectable', 'Logger']);
      const malos = files
        .filter((f) => layerOf(f.path) === 'application')
        .flatMap((f) =>
          [
            ...f.content.matchAll(
              /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@nestjs\/common'/g,
            ),
          ].flatMap((m) =>
            m[1]
              .split(',')
              .map((n) => n.trim())
              .filter((n) => n && !permitidos.has(n))
              .map((n) => `${f.path} usa ${n}`),
          ),
        );
      expect(malos).toEqual([]);
    });
  });

  describe('límites entre bounded contexts', () => {
    it('un módulo solo importa de otro a través de su public-api', () => {
      expect(
        violations((f, imp) => {
          const origen = moduleOf(f.path);
          const destino = moduleOf(imp);
          if (!origen || !destino || origen === destino) return false;
          if (imp === `modules/${destino}/public-api`) return false;
          // El composition root importa el módulo Nest del otro contexto
          // para obtener su fachada por DI.
          const esCompositionRoot =
            f.path === `modules/${origen}/${origen}.module.ts`;
          return !(
            esCompositionRoot && imp === `modules/${destino}/${destino}.module`
          );
        }),
      ).toEqual([]);
    });

    it('solo la infraestructura (adaptadores) consume la public-api de otros contextos', () => {
      expect(
        violations(
          (f, imp) => {
            const destino = moduleOf(imp);
            return (
              destino !== undefined &&
              destino !== moduleOf(f.path) &&
              layerOf(f.path) !== 'infrastructure'
            );
          },
          (f) =>
            moduleOf(f.path) !== undefined && !f.path.endsWith('.module.ts'),
        ),
      ).toEqual([]);
    });

    it('el driver de correo solo lo usa el contexto de notificaciones', () => {
      expect(
        violations(
          (f, imp) =>
            imp.includes('notifications/infrastructure/mail/') &&
            moduleOf(f.path) !== 'notifications',
        ),
      ).toEqual([]);
    });
  });

  describe('cada contexto es dueño de sus tablas', () => {
    // Delegado de Prisma → contextos que pueden escribirlo/leerlo. Identidad
    // agrupa auth, users y account (comparten la tabla users).
    const DUENOS: Record<string, string[]> = {
      order: ['orders'],
      orderStatusHistory: ['orders'],
      payment: ['payments'],
      product: ['products'],
      precioProducto: ['precios'],
      inventarioMaestro: ['inventario'],
      historicalSale: ['ventas'],
      purchase: ['compras'],
      expense: ['gastos'],
      promotion: ['promotions'],
      auditLog: ['audit'],
      user: ['auth', 'users', 'account'],
      address: ['account'],
      refreshToken: ['auth'],
      otpCode: ['auth'],
      passwordReset: ['auth'],
    };
    // Modelo de lectura del dashboard: agrega tablas de todos, solo lectura.
    const LECTURA_TRANSVERSAL = 'modules/metrics/infrastructure/read-model/';

    it('ningún módulo toca tablas de otro contexto', () => {
      const malos = files
        .filter((f) => !f.path.startsWith(LECTURA_TRANSVERSAL))
        .flatMap((f) =>
          [...f.content.matchAll(/\.(?:client|prisma)\.(\w+)\./g)]
            .map((m) => m[1])
            .filter((tabla) => {
              const duenos = DUENOS[tabla];
              const modulo = moduleOf(f.path);
              return duenos !== undefined && !duenos.includes(modulo ?? '');
            })
            .map((tabla) => `${f.path} toca ${tabla}`),
        );
      expect(malos).toEqual([]);
    });

    it('el modelo de lectura de métricas nunca escribe', () => {
      const escrituras =
        /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
      const malos = files
        .filter((f) => f.path.startsWith(LECTURA_TRANSVERSAL))
        .filter((f) => escrituras.test(f.content))
        .map((f) => f.path);
      expect(malos).toEqual([]);
    });
  });
});
