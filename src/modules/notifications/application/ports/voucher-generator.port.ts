export const VOUCHER_GENERATOR = Symbol('VOUCHER_GENERATOR');

export interface VoucherOrderItem {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface VoucherOrder {
  orderNumber: string;
  total: number;
  items: VoucherOrderItem[];
}

export interface VoucherGeneratorPort {
  generate(order: VoucherOrder): Promise<Buffer>;
}
