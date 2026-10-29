export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

export interface Profile {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
}

export interface Address {
  id: string;
  userId: string;
  alias: string | null;
  ciudad: string;
  departamento: string;
  direccion: string;
  esPrincipal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewAddressData {
  alias?: string;
  ciudad: string;
  departamento: string;
  direccion: string;
}

export interface AccountRepositoryPort {
  getProfile(userId: string): Promise<Profile | null>;
  updateProfile(
    userId: string,
    data: { nombre?: string; telefono?: string },
  ): Promise<Profile>;
  listAddresses(userId: string): Promise<Address[]>;
  findAddressById(id: string): Promise<Address | null>;
  countAddresses(userId: string): Promise<number>;
  /** Si `esPrincipal`, desmarca las demás en la misma transacción. */
  createAddress(
    userId: string,
    data: NewAddressData,
    esPrincipal: boolean,
  ): Promise<Address>;
  updateAddress(
    userId: string,
    id: string,
    data: Partial<NewAddressData>,
    marcarPrincipal: boolean,
  ): Promise<Address>;
  setPrincipal(userId: string, id: string): Promise<Address>;
  /** Si se borró la principal y quedan otras, promueve la más antigua. */
  deleteAddress(
    userId: string,
    id: string,
    eraPrincipal: boolean,
  ): Promise<void>;
}
