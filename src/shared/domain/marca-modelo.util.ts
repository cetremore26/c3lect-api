// Identidad marca/modelo compartida por catálogo, inventario, compras y
// ventas (shared kernel): funciones puras, sin acceso a datos. La búsqueda de
// productos por marca/modelo vive en el repositorio de products.

export function combineMarcaModelo(
  marca: string | null | undefined,
  modelo: string,
): string {
  return `${marca ?? ''} ${modelo}`.trim().replace(/\s+/g, ' ');
}

/**
 * Separa marca/modelo a partir de un Product ya cargado, usando Product.marca como prefijo
 * conocido de Product.nombre. Si no aplica (marca ausente o no es prefijo del nombre), devuelve
 * el comportamiento legado: todo el nombre como "modelo", sin marca.
 */
export function deriveMarcaModeloFromProduct(product: {
  nombre: string;
  marca: string | null;
}): { marca: string | null; modelo: string } {
  const { nombre, marca } = product;
  if (marca && nombre.toLowerCase().startsWith(marca.toLowerCase())) {
    const resto = nombre.slice(marca.length).trim();
    if (resto) return { marca, modelo: resto };
  }
  return { marca: null, modelo: nombre };
}
