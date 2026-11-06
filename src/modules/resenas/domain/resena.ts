import { BusinessRuleViolation } from '../../../shared/domain/domain-error';

// Vocabulario propio del dominio; los valores coinciden 1:1 con el enum
// EstadoResena de schema.prisma, así que persistencia los acepta sin traducir.
export const EstadoResena = {
  PUBLICADA: 'PUBLICADA',
  OCULTA: 'OCULTA',
} as const;
export type EstadoResena = (typeof EstadoResena)[keyof typeof EstadoResena];

export const LIMITES_RESENA = {
  calificacionMin: 1,
  calificacionMax: 5,
  tituloMax: 80,
  comentarioMin: 10,
  comentarioMax: 1000,
  respuestaMax: 1000,
} as const;

export interface ContenidoResena {
  calificacion: number;
  titulo: string | null;
  comentario: string;
}

/** Recorta y deja como máximo una línea en blanco entre párrafos. */
function normalizarTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Valida y normaliza lo que escribió el cliente. */
export function validarContenido(input: {
  calificacion: number;
  titulo?: string | null;
  comentario: string;
}): ContenidoResena {
  const { calificacionMin, calificacionMax } = LIMITES_RESENA;
  if (
    !Number.isInteger(input.calificacion) ||
    input.calificacion < calificacionMin ||
    input.calificacion > calificacionMax
  ) {
    throw new BusinessRuleViolation(
      `La calificación debe ser un número entero de ${calificacionMin} a ${calificacionMax}`,
    );
  }

  const comentario = normalizarTexto(input.comentario ?? '');
  if (comentario.length < LIMITES_RESENA.comentarioMin) {
    throw new BusinessRuleViolation(
      `El comentario debe tener al menos ${LIMITES_RESENA.comentarioMin} caracteres`,
    );
  }
  if (comentario.length > LIMITES_RESENA.comentarioMax) {
    throw new BusinessRuleViolation(
      `El comentario no puede superar ${LIMITES_RESENA.comentarioMax} caracteres`,
    );
  }

  const titulo = (input.titulo ?? '').replace(/\s+/g, ' ').trim();
  if (titulo.length > LIMITES_RESENA.tituloMax) {
    throw new BusinessRuleViolation(
      `El título no puede superar ${LIMITES_RESENA.tituloMax} caracteres`,
    );
  }

  return {
    calificacion: input.calificacion,
    titulo: titulo || null,
    comentario,
  };
}

/** Respuesta de la tienda; vacía significa "quitar la respuesta". */
export function normalizarRespuesta(texto: string): string | null {
  const respuesta = normalizarTexto(texto ?? '');
  if (respuesta.length > LIMITES_RESENA.respuestaMax) {
    throw new BusinessRuleViolation(
      `La respuesta no puede superar ${LIMITES_RESENA.respuestaMax} caracteres`,
    );
  }
  return respuesta || null;
}

const capitalizar = (palabra: string) =>
  palabra.charAt(0).toLocaleUpperCase('es') +
  palabra.slice(1).toLocaleLowerCase('es');

/**
 * Cómo firma el cliente en público: nombre de pila y la inicial de la
 * siguiente palabra ("juan pérez gómez" → "Juan P."). Nunca el nombre
 * completo: la reseña es pública y el cliente no eligió exponerse.
 */
export function nombrePublico(nombreCompleto: string | null | undefined) {
  const palabras = (nombreCompleto ?? '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return 'Cliente C3LECT';
  const nombre = capitalizar(palabras[0]);
  if (palabras.length === 1) return nombre;
  return `${nombre} ${palabras[1].charAt(0).toLocaleUpperCase('es')}.`;
}
