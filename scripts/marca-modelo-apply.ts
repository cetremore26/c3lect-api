// Script de aplicación (uno solo, con vos presente): toma el CSV ya revisado de
// marca-modelo-report.ts y separa marca/modelo en Compras, Ventas, Inventario y Precios,
// además de completar Product.marca donde esté vacío.
//
// Uso:
//   npx dotenv -e .env -- npx ts-node scripts/marca-modelo-apply.ts --file scripts/output/<archivo>.csv [--dry-run]
//
// --dry-run: no escribe nada, solo muestra cuántas filas coincidirían por tabla.

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { parseCsv } from './csv';

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const dryRun = args.includes('--dry-run');

  if (fileIndex === -1 || !args[fileIndex + 1]) {
    console.error('Uso: npx ts-node scripts/marca-modelo-apply.ts --file <ruta-al-csv-revisado> [--dry-run]');
    process.exit(1);
  }

  const filePath = args[fileIndex + 1];
  const rows = parseCsv(readFileSync(filePath, 'utf-8'));

  const invalidas = rows.filter(
    (r) => !r.original_modelo || !r.suggested_marca?.trim() || !r.suggested_modelo?.trim(),
  );
  if (invalidas.length > 0) {
    console.error(`${invalidas.length} fila(s) sin marca o modelo. Corrige el CSV antes de continuar:`);
    for (const r of invalidas) console.error(`  - "${r.original_modelo}"`);
    process.exit(1);
  }

  console.log(dryRun ? '--- DRY RUN (sin escribir en la base de datos) ---' : '--- Aplicando cambios ---');

  const prisma = new PrismaClient();
  const resumen = {
    purchases: 0,
    historical_sales: 0,
    inventario_maestro: 0,
    calculo_precios: 0,
    productos_backfilled: 0,
    fallidas: [] as string[],
  };

  try {
    for (const row of rows) {
      const original = row.original_modelo;
      const marca = row.suggested_marca.trim();
      const modelo = row.suggested_modelo.trim();

      if (dryRun) {
        const [p, v, inv, prc, prod] = await Promise.all([
          prisma.purchase.count({ where: { modelo: original } }),
          prisma.historicalSale.count({ where: { modelo: original } }),
          prisma.inventarioMaestro.count({ where: { modelo: original } }),
          prisma.precioProducto.count({ where: { modelo: original } }),
          prisma.product.count({ where: { nombre: { equals: original, mode: 'insensitive' }, marca: null } }),
        ]);
        resumen.purchases += p;
        resumen.historical_sales += v;
        resumen.inventario_maestro += inv;
        resumen.calculo_precios += prc;
        resumen.productos_backfilled += prod;
        continue;
      }

      const [p, v] = await Promise.all([
        prisma.purchase.updateMany({ where: { modelo: original }, data: { marca, modelo } }),
        prisma.historicalSale.updateMany({ where: { modelo: original }, data: { marca, modelo } }),
      ]);
      resumen.purchases += p.count;
      resumen.historical_sales += v.count;

      try {
        const inv = await prisma.inventarioMaestro.updateMany({ where: { modelo: original }, data: { marca, modelo } });
        resumen.inventario_maestro += inv.count;
      } catch (e) {
        resumen.fallidas.push(
          `inventario_maestro: "${original}" -> marca="${marca}" modelo="${modelo}" (${(e as Error).message})`,
        );
      }

      try {
        const prc = await prisma.precioProducto.updateMany({ where: { modelo: original }, data: { marca, modelo } });
        resumen.calculo_precios += prc.count;
      } catch (e) {
        resumen.fallidas.push(
          `calculo_precios: "${original}" -> marca="${marca}" modelo="${modelo}" (${(e as Error).message})`,
        );
      }

      const prod = await prisma.product.updateMany({
        where: { nombre: { equals: original, mode: 'insensitive' }, marca: null },
        data: { marca },
      });
      resumen.productos_backfilled += prod.count;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n--- Resumen ---');
  console.log(`purchases:          ${resumen.purchases}`);
  console.log(`historical_sales:   ${resumen.historical_sales}`);
  console.log(`inventario_maestro: ${resumen.inventario_maestro}`);
  console.log(`calculo_precios:    ${resumen.calculo_precios}`);
  console.log(`productos.marca completados: ${resumen.productos_backfilled}`);

  if (resumen.fallidas.length > 0) {
    console.log(`\nFILAS QUE NECESITAN FUSIÓN MANUAL (${resumen.fallidas.length}):`);
    for (const f of resumen.fallidas) console.log(`  - ${f}`);
    console.log('\nEstas filas chocaron con la restricción @unique de modelo (dos marcas distintas');
    console.log('con el mismo modelo corto). Resuélvelas a mano y vuelve a correr solo esas filas.');
  } else if (!dryRun) {
    console.log('\nSin conflictos.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
