import { Pool, PoolClient } from 'pg';
import { deriveMarcaModeloFromProduct } from '../../../../shared/domain/marca-modelo.util';
import {
  calcularPrecioFinal,
  mejorDescuento,
  PromocionLike,
} from '../../../promotions/domain/promotions.util';

// Test de integración: la vista `catalogo_publico` (migración
// 20261029000000) replica en SQL reglas que el backend tiene en TypeScript.
// Este test inserta un catálogo de prueba, consulta la vista y compara cada
// fila contra las funciones TS. Corre dentro de una transacción que se revierte.
//
//   INTEGRATION_DATABASE_URL=postgresql://... pnpm test:int
//
// Sin la variable, se omite. NUNCA apuntarla a producción.
const url = process.env.INTEGRATION_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const AHORA = Date.now();
const DIA = 24 * 60 * 60 * 1000;

interface Fila {
  id: string;
  nombre: string;
  marca: string | null;
  cat: string;
  precio: number;
  estilo: string;
  imgs: string[];
}

const productos: Fila[] = [
  // marca como prefijo → modelo "Submariner"; inventario por modelo derivado
  {
    id: 'r-rolex-sub',
    nombre: 'Rolex Submariner',
    marca: 'Rolex',
    cat: 'reloj',
    precio: 1000000,
    estilo: 'Negro',
    imgs: ['a.webp'],
  },
  // fila legada: inventario guarda el nombre completo
  {
    id: 'r-casio-gshock',
    nombre: 'Casio G-Shock',
    marca: 'Casio',
    cat: 'reloj',
    precio: 349900,
    estilo: 'Azul',
    imgs: ['b.webp'],
  },
  // sin marca y sin inventario → stock null
  {
    id: 'a-organizador',
    nombre: 'Organizador',
    marca: null,
    cat: 'accesorio',
    precio: 59999,
    estilo: 'Cuero',
    imgs: ['c.webp'],
  },
  // marca que no es prefijo del nombre → modelo = nombre completo
  {
    id: 'p-yara',
    nombre: 'Yara EDP',
    marca: 'Lattafa',
    cat: 'perfume',
    precio: 189000,
    estilo: 'N/A',
    imgs: ['d.webp'],
  },
  // excluidos de la vista: sin precio, sin imágenes, sin estilo
  {
    id: 'x-sin-precio',
    nombre: 'Sin Precio',
    marca: null,
    cat: 'reloj',
    precio: 0,
    estilo: 'X',
    imgs: ['e.webp'],
  },
  {
    id: 'x-sin-imgs',
    nombre: 'Sin Imgs',
    marca: null,
    cat: 'reloj',
    precio: 100,
    estilo: 'X',
    imgs: [],
  },
  {
    id: 'x-sin-estilo',
    nombre: 'Sin Estilo',
    marca: null,
    cat: 'reloj',
    precio: 100,
    estilo: '',
    imgs: ['f.webp'],
  },
];

const inventario = [
  { modelo: 'submariner', stock: 4 }, // distinto casing: la búsqueda no distingue
  { modelo: 'Casio G-Shock', stock: 0 },
];

const promociones: (PromocionLike & { id: string })[] = [
  promo('todos-10', {
    alcance: 'TODOS',
    porcentaje: 10,
    excluidos: ['a-organizador'],
  }),
  promo('perfumes-20', {
    alcance: 'CATEGORIA',
    categoria: 'perfume',
    porcentaje: 20,
  }),
  promo('rolex-cuenta-25', {
    alcance: 'MARCA',
    marca: 'Rolex',
    porcentaje: 25,
    soloCuentaActiva: true,
  }),
  promo('casio-15', {
    alcance: 'PRODUCTO',
    productosIncluidos: ['r-casio-gshock'],
    porcentaje: 15,
  }),
  promo('vencida-50', {
    alcance: 'TODOS',
    porcentaje: 50,
    fechaFin: new Date(AHORA - DIA),
  }),
  promo('futura-50', {
    alcance: 'TODOS',
    porcentaje: 50,
    fechaInicio: new Date(AHORA + DIA),
  }),
  promo('inactiva-60', { alcance: 'TODOS', porcentaje: 60, activo: false }),
];

function promo(
  id: string,
  p: Partial<PromocionLike>,
): PromocionLike & { id: string } {
  return {
    id,
    alcance: 'TODOS',
    porcentaje: 0,
    productosIncluidos: [],
    categoria: null,
    marca: null,
    excluidos: [],
    soloCuentaActiva: false,
    fechaInicio: new Date(AHORA - DIA),
    fechaFin: new Date(AHORA + DIA),
    activo: true,
    ...p,
  };
}

describeDb('catalogo_publico (paridad SQL ↔ TypeScript)', () => {
  let pool: Pool;
  let db: PoolClient;
  let filas: Record<string, Record<string, unknown>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = await pool.connect();
    await db.query('BEGIN');

    // Aislar el test de lo que ya haya en la base.
    await db.query('DELETE FROM promociones');
    await db.query('DELETE FROM inventario_maestro');
    for (const p of productos) {
      await db.query(
        `INSERT INTO productos (id, nombre, marca, cat, precio, estilo, display, imgs, disponible)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id,
          p.nombre,
          p.marca,
          p.cat,
          p.precio,
          p.estilo,
          `${p.nombre} — ${p.estilo}`,
          p.imgs,
        ],
      );
    }
    for (const i of inventario) {
      await db.query(
        `INSERT INTO inventario_maestro (id, modelo, stock, updated_at)
         VALUES (gen_random_uuid(), $1, $2, now())`,
        [i.modelo, i.stock],
      );
    }
    for (const pr of promociones) {
      await db.query(
        `INSERT INTO promociones (id, nombre, alcance, porcentaje, productos_incluidos, categoria,
           marca, excluidos, solo_cuenta_activa, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES ($1, $1, $2::"PromotionScope", $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
        [
          pr.id,
          pr.alcance,
          pr.porcentaje,
          pr.productosIncluidos,
          pr.categoria,
          pr.marca,
          pr.excluidos,
          pr.soloCuentaActiva,
          pr.fechaInicio,
          pr.fechaFin,
          pr.activo,
        ],
      );
    }

    const { rows } = await db.query<{ id: string } & Record<string, unknown>>(
      `SELECT * FROM catalogo_publico WHERE id = ANY($1)`,
      [productos.map((p) => p.id)],
    );
    filas = Object.fromEntries(rows.map((r) => [r.id, r]));
  });

  afterAll(async () => {
    await db?.query('ROLLBACK');
    db?.release();
    await pool?.end();
  });

  it('solo publica productos completos (precio, estilo e imágenes)', () => {
    expect(Object.keys(filas).sort()).toEqual(
      ['a-organizador', 'p-yara', 'r-casio-gshock', 'r-rolex-sub'].sort(),
    );
  });

  it('sanea el estilo "N/A": estilo vacío y display = nombre', () => {
    expect(filas['p-yara'].estilo).toBe('');
    expect(filas['p-yara'].display).toBe('Yara EDP');
  });

  it('cruza el stock igual que el backend (modelo derivado, luego nombre legado)', () => {
    expect(filas['r-rolex-sub'].stock).toBe(4);
    expect(filas['r-casio-gshock'].stock).toBe(0);
    expect(filas['a-organizador'].stock).toBeNull();
    // el modelo derivado que usa la vista coincide con el de TypeScript
    expect(deriveMarcaModeloFromProduct(productos[0]).modelo).toBe(
      'Submariner',
    );
  });

  it.each(productos.slice(0, 4).map((p) => [p.id, p] as const))(
    'descuento y precio final de %s coinciden con promotions.util',
    (_, p) => {
      const fila = filas[p.id];
      for (const [autenticado, col] of [
        [false, 'invitado'],
        [true, 'cuenta'],
      ] as const) {
        const descuento = mejorDescuento(promociones, p, autenticado);
        expect({ col, descuento: fila[`descuento_${col}`] }).toEqual({
          col,
          descuento,
        });
        expect({ col, precio: fila[`precio_final_${col}`] }).toEqual({
          col,
          precio: calcularPrecioFinal(p.precio, descuento),
        });
      }
    },
  );
});
