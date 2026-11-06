export const AUTORES = Symbol('AUTORES');

// Los usuarios son del contexto de identidad: reseñas solo necesita el nombre
// del autor para tomar la firma pública en el momento de escribir.
export interface AutoresPort {
  nombreDe(userId: string): Promise<string | undefined>;
}
