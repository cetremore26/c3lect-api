// Script de solo lectura: genera un reporte CSV con la separación marca/modelo propuesta para
// cada texto "modelo" distinto que ya existe en Compras, Ventas, Inventario y Precios.
// NO escribe nada en la base de datos. Revisa/corrige el CSV de salida antes de aplicarlo con
// marca-modelo-apply.ts.
//
// Uso: npx dotenv -e .env -- npx ts-node scripts/marca-modelo-report.ts

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { writeCsv } from './csv';

type Confianza = 'alta' | 'media' | 'baja';

interface Sugerencia {
  marca: string;
  modelo: string;
  confianza: Confianza;
}

function splitModelo(
  original: string,
  hintMarcaPorNombre: Map<string, string>,
  marcasConocidas: string[],
): Sugerencia {
  const hint = hintMarcaPorNombre.get(original.toLowerCase());
  if (hint && original.toLowerCase().startsWith(hint.toLowerCase())) {
    const resto = original.slice(hint.length).trim();
    if (resto) return { marca: hint, modelo: resto, confianza: 'alta' };
  }

  for (const marca of marcasConocidas) {
    if (original.toLowerCase().startsWith(marca.toLowerCase() + ' ')) {
      const resto = original.slice(marca.length).trim();
      if (resto) return { marca, modelo: resto, confianza: 'media' };
    }
  }

  const espacio = original.indexOf(' ');
  if (espacio === -1) return { marca: original, modelo: '', confianza: 'baja' };
  return {
    marca: original.slice(0, espacio),
    modelo: original.slice(espacio + 1).trim(),
    confianza: 'baja',
  };
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const [compras, ventas, inventario, precios, productosConMarca] = await Promise.all([
      prisma.purchase.groupBy({ by: ['modelo'], _count: { modelo: true } }),
      prisma.historicalSale.groupBy({ by: ['modelo'], _count: { modelo: true } }),
      prisma.inventarioMaestro.groupBy({ by: ['modelo'], _count: { modelo: true } }),
      prisma.precioProducto.groupBy({ by: ['modelo'], _count: { modelo: true } }),
      prisma.product.findMany({
        where: { marca: { not: null } },
        select: { nombre: true, marca: true },
      }),
    ]);

    const hintMarcaPorNombre = new Map<string, string>();
    const marcasSet = new Set<string>();
    for (const p of productosConMarca) {
      if (!p.marca) continue;
      hintMarcaPorNombre.set(p.nombre.toLowerCase(), p.marca);
      marcasSet.add(p.marca);
    }
    // Más largas primero para que un prefijo más específico gane sobre uno genérico.
    const marcasConocidas = Array.from(marcasSet).sort((a, b) => b.length - a.length);

    const origenPorModelo = new Map<string, { tablas: Set<string>; ocurrencias: number }>();
    const registrar = (tabla: string, filas: { modelo: string; _count: { modelo: number } }[]) => {
      for (const f of filas) {
        const entry = origenPorModelo.get(f.modelo) ?? { tablas: new Set<string>(), ocurrencias: 0 };
        entry.tablas.add(tabla);
        entry.ocurrencias += f._count.modelo;
        origenPorModelo.set(f.modelo, entry);
      }
    };
    registrar('purchases', compras);
    registrar('historical_sales', ventas);
    registrar('inventario_maestro', inventario);
    registrar('calculo_precios', precios);

    const filas = Array.from(origenPorModelo.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([original, { tablas, ocurrencias }]) => {
        const sugerencia = splitModelo(original, hintMarcaPorNombre, marcasConocidas);
        return [
          original,
          sugerencia.marca,
          sugerencia.modelo,
          sugerencia.confianza,
          Array.from(tablas).sort().join(';'),
          String(ocurrencias),
        ];
      });

    const csv = writeCsv(
      ['original_modelo', 'suggested_marca', 'suggested_modelo', 'confidence', 'source_tables', 'occurrence_count'],
      filas,
    );

    const outDir = join(__dirname, 'output');
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `marca-modelo-report-${Date.now()}.csv`);
    writeFileSync(outPath, csv, 'utf-8');

    const porConfianza = { alta: 0, media: 0, baja: 0 };
    for (const f of filas) porConfianza[f[3] as Confianza]++;

    console.log(`Reporte generado: ${outPath}`);
    console.log(`Total de modelos distintos: ${filas.length}`);
    console.log(`  Confianza alta:  ${porConfianza.alta}`);
    console.log(`  Confianza media: ${porConfianza.media}`);
    console.log(`  Confianza baja:  ${porConfianza.baja} (revisar con cuidado)`);
    console.log('\nRevisa y corrige el CSV antes de correr marca-modelo-apply.ts.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
