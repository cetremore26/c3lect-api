import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';
import { combineMarcaModelo } from '../../common/marca-modelo.util';
import { ComprasRepository } from './compras.repository';
import { costoTotalCompra, planCompraUpdate } from './compras.util';

@Injectable()
export class ComprasService {
  constructor(
    private readonly comprasRepository: ComprasRepository,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCompraDto, userId?: string) {
    const costoTotal = costoTotalCompra(dto.cantidad, dto.costoUnitario);

    const compra = await this.comprasRepository.create({
      fecha: new Date(dto.fecha),
      marca: dto.marca,
      modelo: dto.modelo,
      cantidad: dto.cantidad,
      costoUnitario: dto.costoUnitario,
      costoTotal,
      categoria: dto.categoria,
    });

    await this.audit.log(
      'CREAR',
      'compra',
      compra.id,
      `Nueva compra: ${dto.cantidad}x ${combineMarcaModelo(dto.marca, dto.modelo)} — $${costoTotal.toLocaleString('es-CO')}`,
      userId,
    );

    return compra;
  }

  async update(id: string, dto: UpdateCompraDto, userId?: string) {
    const existing = await this.comprasRepository.findById(id);
    const plan = planCompraUpdate(existing, dto);

    const compra = await this.comprasRepository.update(id, existing, plan);

    await this.audit.log(
      'EDITAR',
      'compra',
      id,
      `Compra editada: ${combineMarcaModelo(plan.marca, plan.modelo)} — ${plan.cantidad} ud${plan.cantidad !== 1 ? 's' : ''} a $${plan.costoUnitario.toLocaleString('es-CO')}`,
      userId,
    );

    return compra;
  }
}
