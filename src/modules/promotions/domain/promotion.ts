import type { PromocionLike } from './promotions.util';

export type PromotionScope = PromocionLike['alcance'];

export interface PromotionData {
  nombre: string;
  alcance: PromotionScope;
  porcentaje: number;
  productosIncluidos?: string[];
  categoria?: string;
  marca?: string;
  excluidos?: string[];
  soloCuentaActiva?: boolean;
  fechaInicio: string;
  fechaFin: string;
  activo?: boolean;
}

export interface Promotion extends PromocionLike {
  id: string;
  nombre: string;
  createdAt: Date;
  updatedAt: Date;
}
