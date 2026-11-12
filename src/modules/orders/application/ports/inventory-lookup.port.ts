export const INVENTORY_LOOKUP = Symbol('INVENTORY_LOOKUP');

// Solo la consulta de stock, usada como verificación best-effort al crear un
// pedido. El descuento autoritativo lo hace inventario al reaccionar a
// PedidoConfirmado, dentro de la transacción de la confirmación.
export interface InventoryLookupPort {
  /**
   * Fila de inventario (id y stock) del modelo, o null si no está rastreado.
   * Varios productos pueden compartir una misma fila.
   */
  filaDeStock(
    modelo: string,
    nombreCompletoLegado: string,
  ): Promise<{ id: string; stock: number } | null>;
}
