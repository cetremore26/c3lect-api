export interface CompraParaAgrupar {
  marca: string | null;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  categoria: string;
}

export interface VentaParaContar {
  modelo: string;
}

export interface ModeloAgrupado {
  marca: string | null;
  cantidad: number;
  costoUnitario: number;
  categoria: string;
}

// Agrupar compras por modelo. NOTA: mientras InventarioMaestro.modelo siga siendo la única
// llave (@unique de una sola columna, hasta que el backfill de marca esté completo y se
// pase a @@unique([marca, modelo])), dos marcas distintas con el mismo modelo corto todavía
// colisionan en una sola fila — riesgo aceptado y documentado para esta ventana de transición.
export function agruparComprasPorModelo(
  compras: CompraParaAgrupar[],
): Record<string, ModeloAgrupado> {
  const porModelo: Record<string, ModeloAgrupado> = {};
  for (const c of compras) {
    if (!porModelo[c.modelo]) {
      porModelo[c.modelo] = {
        marca: c.marca,
        cantidad: 0,
        costoUnitario: c.costoUnitario,
        categoria: c.categoria,
      };
    }
    porModelo[c.modelo].cantidad += c.cantidad;
    porModelo[c.modelo].costoUnitario = c.costoUnitario; // usa el más reciente
    porModelo[c.modelo].marca = c.marca ?? porModelo[c.modelo].marca; // usa la más reciente no nula
  }
  return porModelo;
}

// Toda venta (incluso Uso Personal con precioVenta=0) descuenta stock físico
export function contarVentasPorModelo(
  ventas: VentaParaContar[],
): Record<string, number> {
  const ventasPorModelo: Record<string, number> = {};
  for (const v of ventas) {
    ventasPorModelo[v.modelo] = (ventasPorModelo[v.modelo] ?? 0) + 1;
  }
  return ventasPorModelo;
}

export function calcularStock(
  cantidadComprada: number,
  vendidos: number,
): number {
  return Math.max(0, cantidadComprada - vendidos);
}

export function capitalItem(stock: number, costoUnitario: number): number {
  return stock * costoUnitario;
}
