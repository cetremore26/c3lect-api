import type { Promotion, PromotionData } from '../../domain/promotion';

export const PROMOTIONS_REPOSITORY = Symbol('PROMOTIONS_REPOSITORY');

export interface PromotionsRepositoryPort {
  findAll(): Promise<Promotion[]>;
  findVigentes(ahora: Date): Promise<Promotion[]>;
  findById(id: string): Promise<Promotion | null>;
  create(data: PromotionData): Promise<Promotion>;
  update(id: string, data: Partial<PromotionData>): Promise<Promotion>;
  remove(id: string): Promise<void>;
}
