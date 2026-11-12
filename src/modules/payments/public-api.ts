// Lo único que otros módulos pueden importar de payments.
export {
  PagoAprobado,
  PagoDuplicado,
  PagoReembolsado,
  PagoSinPedido,
} from './domain/payment-events';
export type { ClientePago } from './domain/payment-events';
