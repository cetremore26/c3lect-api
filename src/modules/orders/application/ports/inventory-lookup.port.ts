export const INVENTORY_LOOKUP = Symbol('INVENTORY_LOOKUP');

export interface InventarioLookup {
  id: string;
  stock: number;
}

// Solo la consulta de stock, usada como verificación best-effort al crear un
// pedido (antes de que exista una transacción). El decremento/reversión real
// de stock ocurre atómicamente junto al cambio de estado — ver
// OrderRepositoryPort.transitionStatus / createConfirmed — y por eso vive en
// infrastructure, no como un método más de este puerto.
export interface InventoryLookupPort {
  findByModelo(
    modelo: string,
    nombreCompletoLegado: string,
  ): Promise<InventarioLookup | null>;
}
