export const CATEGORIAS = ['reloj', 'perfume', 'accesorio'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

// Debe mantenerse en sync con el enum CategoriaCompra en
// src/modules/compras/dto/create-compra.dto.ts (los enums de string de
// TypeScript no admiten inicializadores derivados de una expresión).
export const CATEGORIA_CAPITALIZADA: Record<Categoria, string> = {
  reloj: 'Reloj',
  perfume: 'Perfume',
  accesorio: 'Accesorio',
};

export const CATEGORIA_PREFIX: Record<Categoria, string> = {
  reloj: 'r',
  perfume: 'p',
  accesorio: 'a',
};

export function categoriaDesdeCapitalizada(cat: string): Categoria {
  return CATEGORIAS.find((c) => CATEGORIA_CAPITALIZADA[c] === cat) ?? 'reloj';
}

const PERFUME_KEYWORDS = ['Lattafa', 'Afnan', 'Sahari', 'Zakat', 'Grandeur', 'Amaran'];

// Heurística sobre el texto libre de `modelo` — HistoricalSale no tiene
// columna de categoría propia, así que no hay valor almacenado del que partir.
export function clasificarModelo(modelo: string): Categoria {
  if (modelo.includes('Organizador')) return 'accesorio';
  if (PERFUME_KEYWORDS.some((k) => modelo.includes(k))) return 'perfume';
  return 'reloj';
}
