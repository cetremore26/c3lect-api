// Lo único que otros módulos pueden importar de inventario.
export { InventarioFacade } from './application/inventario.facade';
export {
  InventarioRecalculado,
  MercanciaIngresada,
  SalidaPorPedidoRegistrada,
  StockAgotado,
  StockRepuesto,
} from './domain/inventario-events';
