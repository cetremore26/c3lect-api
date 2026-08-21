import { BadRequestException, Injectable } from '@nestjs/common';
import { Product } from '@prisma/client';
import { PromotionsRepository } from './promotions.repository';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { mejorDescuento, calcularPrecioFinal } from './promotions.util';

@Injectable()
export class PromotionsService {
  constructor(private readonly promotionsRepository: PromotionsRepository) {}

  findAll() {
    return this.promotionsRepository.findAll();
  }

  findOne(id: string) {
    return this.promotionsRepository.findById(id);
  }

  create(dto: CreatePromotionDto) {
    this.validateFechas(dto.fechaInicio, dto.fechaFin);
    return this.promotionsRepository.create(dto);
  }

  async update(id: string, dto: UpdatePromotionDto) {
    if (dto.fechaInicio || dto.fechaFin) {
      const actual = await this.promotionsRepository.findById(id);
      this.validateFechas(
        dto.fechaInicio ?? actual.fechaInicio.toISOString(),
        dto.fechaFin ?? actual.fechaFin.toISOString(),
      );
    }
    return this.promotionsRepository.update(id, dto);
  }

  remove(id: string) {
    return this.promotionsRepository.remove(id);
  }

  getPromocionesVigentes() {
    return this.promotionsRepository.findVigentes(new Date());
  }

  // Precio efectivo server-side para un producto — usado por Orders/Payments
  // al resolver el precio real de un pedido, nunca confiando en lo que
  // mande el cliente.
  async precioEfectivo(product: Product, autenticado: boolean) {
    const vigentes = await this.getPromocionesVigentes();
    const descuentoPorcentaje = mejorDescuento(vigentes, product, autenticado);
    return {
      precioOriginal: product.precio,
      precioFinal: calcularPrecioFinal(product.precio, descuentoPorcentaje),
      descuentoPorcentaje,
    };
  }

  private validateFechas(fechaInicio: string, fechaFin: string): void {
    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      throw new BadRequestException(
        'fechaFin debe ser posterior a fechaInicio',
      );
    }
  }
}
