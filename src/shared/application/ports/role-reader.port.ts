export const ROLE_READER = Symbol('ROLE_READER');

/** Lee el rol vigente de un usuario (la fuente de verdad es la base, no el token). */
export interface RoleReaderPort {
  rolActual(userId: string): Promise<string | null>;
}
