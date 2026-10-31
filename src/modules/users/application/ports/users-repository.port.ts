export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export type Rol = 'ADMIN' | 'CLIENTE';

export interface UserListRow {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  createdAt: Date;
}

export interface UserProfile extends UserListRow {
  telefono: string | null;
  ciudad: string | null;
  departamento: string | null;
  direccion: string | null;
}

export interface UsersRepositoryPort {
  findAllPaginated(
    filter: { search?: string },
    skip: number,
    take: number,
  ): Promise<{ data: UserListRow[]; total: number }>;

  findById(id: string): Promise<UserProfile | null>;

  findNombre(id: string): Promise<string | undefined>;
}
