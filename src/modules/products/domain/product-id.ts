import {
  CATEGORIA_PREFIX,
  Categoria,
} from '../../../shared/domain/categoria.util';

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9&-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Convención de IDs del catálogo: {r|p|a}-marca-modelo(-estilo si aplica), ej. "r-curren-8442-blue-white".
export function buildProductId(
  cat: string,
  marca: string | null | undefined,
  modelo: string,
  estilo?: string,
): string {
  const prefijo = CATEGORIA_PREFIX[cat as Categoria] ?? 'r';
  const partes = [
    slugify(marca ?? ''),
    slugify(modelo),
    estilo ? slugify(estilo) : '',
  ].filter(Boolean);
  return [prefijo, ...partes].join('-');
}
