export const USER_DIRECTORY = Symbol('USER_DIRECTORY');

// Lo único que auditoría necesita saber de los usuarios: su nombre. La tabla
// user es de identidad; auditoría pregunta a través de este puerto.
export interface UserDirectoryPort {
  findNombre(userId: string): Promise<string | undefined>;
}
