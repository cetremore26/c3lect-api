import type { VentaUpdatePlan } from '../../domain/ventas.util';

export const VENTAS_REPOSITORY = Symbol('VENTAS_REPOSITORY');

export interface Venta {
  id: string;
  orderId: string | null;
  fecha: Date;
  cliente: string;
  celular: string | null;
  marca: string | null;
  modelo: string;
  estilo: string | null;
  precioVenta: number;
  costoProducto: number;
  costoEnvio: number;
  abono: number;
  saldoPendiente: number;
  gananciaNeta: number | null;
  fuente: string | null;
  estado: string;
  createdAt: Date;
}

export type NuevaVenta = Omit<Venta, 'id' | 'createdAt' | 'orderId'> & {
  orderId?: string | null;
};

// Único dueño de historical_sales. El stock ya no se toca desde aquí.
export interface VentasRepositoryPort {
  findById(id: string): Promise<Venta | null>;
  create(data: NuevaVenta): Promise<Venta>;
  createMany(data: NuevaVenta[]): Promise<void>;
  update(id: string, plan: VentaUpdatePlan): Promise<Venta>;
  remove(id: string): Promise<void>;
  removeByOrderId(orderId: string): Promise<void>;
  modelosVendidos(): Promise<{ modelo: string }[]>;
}
