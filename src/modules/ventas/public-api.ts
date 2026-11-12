// Lo único que otros módulos pueden importar de ventas.
export { VentasFacade } from './application/ventas.facade';
export { calcGananciaPorVenta } from './domain/ganancia';
export {
  VentaEliminada,
  VentaManualRegistrada,
  VentasDePedidoAnuladas,
} from './domain/venta-events';
