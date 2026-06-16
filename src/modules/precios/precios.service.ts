import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePrecioDto } from './dto/create-precio.dto';
import { UpdatePrecioDto } from './dto/update-precio.dto';

const PRECIOS_EXCEL = [
  { modelo: 'Skeleton Kosmo 644-6',          costoUnitario: 370000, costoAdicional: 25028, precioPublico: 550000, precioCierre: 499000 },
  { modelo: 'Curren 8329 (Metálico)',          costoUnitario:  90000, costoAdicional: 25028, precioPublico: 169000, precioCierre: 149000 },
  { modelo: 'Curren 8291 (Deportivo)',         costoUnitario:  80000, costoAdicional: 25028, precioPublico: 159000, precioCierre: 139000 },
  { modelo: 'Geneva (Set Dama)',               costoUnitario:  45000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Casio LTP-V007D-4E (Dama)',       costoUnitario: 128000, costoAdicional: 25028, precioPublico: 169000, precioCierre: 155000 },
  { modelo: 'Casio F-91WM-3A (Verde)',         costoUnitario:  95000, costoAdicional: 25028, precioPublico: 139000, precioCierre: 129000 },
  { modelo: 'Casio F-91WM-7A',                costoUnitario:  85000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Casio MQ-24-7B (Clasico)',        costoUnitario:  75000, costoAdicional: 25028, precioPublico: 115000, precioCierre: 105000 },
  { modelo: 'Poedagar 826 (Silver Blue)',      costoUnitario:  45000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Naviforce NF 7105',              costoUnitario:  65000, costoAdicional: 25028, precioPublico: 169000, precioCierre: 149000 },
  { modelo: 'Curren 9093 (Dorado Dama)',       costoUnitario:  40000, costoAdicional: 25028, precioPublico: 109000, precioCierre:  99000 },
  { modelo: 'Curren 8488 (Rectangular)',       costoUnitario:  90000, costoAdicional: 25028, precioPublico: 169000, precioCierre: 149000 },
  { modelo: 'Curren 8365 (Elegante)',          costoUnitario:  50000, costoAdicional: 25028, precioPublico: 139000, precioCierre: 129000 },
  { modelo: 'Curren 8457 (Silver Black)',      costoUnitario:  55000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Curren 9094 (Silver Dama)',       costoUnitario:  45000, costoAdicional: 25028, precioPublico: 119000, precioCierre: 109000 },
  { modelo: 'Curren 9094 (Silver Green Dama)', costoUnitario:  55000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Curren 9015 (Negro cobre Dama)',  costoUnitario:  55000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Poedagar 793 (Silver White)',     costoUnitario:  50000, costoAdicional: 25028, precioPublico: 119000, precioCierre: 109000 },
  { modelo: 'Curren 8442 (Blue/White)',        costoUnitario:  80000, costoAdicional: 25028, precioPublico: 169000, precioCierre: 149000 },
  { modelo: 'Lattafa Al Qiam Gold',            costoUnitario: 145000, costoAdicional: 25028, precioPublico: 260000, precioCierre: 220000 },
  { modelo: 'Afnan 9 PM REBEL (Roja)',         costoUnitario: 180000, costoAdicional: 25028, precioPublico: 270000, precioCierre: 240000 },
  { modelo: 'Afnan 9 PM (Negra)',              costoUnitario: 160000, costoAdicional: 25028, precioPublico: 250000, precioCierre: 220000 },
  { modelo: 'Lattafa Amethyst',               costoUnitario: 135000, costoAdicional: 25028, precioPublico: 240000, precioCierre: 210000 },
  { modelo: 'Lattafa Sublime',                costoUnitario: 135000, costoAdicional: 25028, precioPublico: 240000, precioCierre: 210000 },
  { modelo: 'Grandeur Dakota',                costoUnitario:  90000, costoAdicional: 25028, precioPublico: 190000, precioCierre: 170000 },
  { modelo: 'Zakat Royale Rubinia',           costoUnitario:  80000, costoAdicional: 25028, precioPublico: 190000, precioCierre: 160000 },
  { modelo: 'Sahari Crystal Rose',            costoUnitario:  90000, costoAdicional: 25028, precioPublico: 180000, precioCierre: 160000 },
  { modelo: 'Sahari Ahwak',                   costoUnitario:  90000, costoAdicional: 25028, precioPublico: 180000, precioCierre: 160000 },
  { modelo: 'Amaran Sunrise (Madame)',         costoUnitario:  90000, costoAdicional: 25028, precioPublico: 200000, precioCierre: 180000 },
  { modelo: 'Zakat Al Awwal',                 costoUnitario:  90000, costoAdicional: 25028, precioPublico: 200000, precioCierre: 180000 },
  { modelo: 'Curren 8467',                    costoUnitario:  52000, costoAdicional: 25028, precioPublico: 149000, precioCierre: 129000 },
  { modelo: 'Curren 8411',                    costoUnitario:  49000, costoAdicional: 25028, precioPublico: 149000, precioCierre: 129000 },
  { modelo: 'Curren 8225',                    costoUnitario:  50000, costoAdicional: 25028, precioPublico: 159000, precioCierre: 139000 },
  { modelo: 'Naviforce NF 8051T',             costoUnitario:  62000, costoAdicional: 25028, precioPublico: 169000, precioCierre: 149000 },
  { modelo: 'Organizador de Relojes 5 Ranuras', costoUnitario: 20000, costoAdicional: 25028, precioPublico: 79000, precioCierre: 69000 },
  { modelo: 'Fossil BQ1420',                  costoUnitario: 458000, costoAdicional: 30000, precioPublico: 749000, precioCierre: 699000 },
  { modelo: 'Q&Q QZ65J001Y (Dama)',           costoUnitario:  55000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Q&Q QZ81J401Y (Dama)',           costoUnitario:  55000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Q&Q QA17J201Y (Dama)',           costoUnitario:  55000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'Casio LTP-1094Q-7B7 (Dama)',     costoUnitario: 120000, costoAdicional: 25028, precioPublico: 199000, precioCierre: 179000 },
  { modelo: 'Q&Q Q945J401Y (Dama)',           costoUnitario:  55000, costoAdicional: 25028, precioPublico: 129000, precioCierre: 119000 },
  { modelo: 'G-FORCE CLASSIC C-307 (Dama)',   costoUnitario:  63000, costoAdicional: 25028, precioPublico: 149000, precioCierre: 139000 },
  { modelo: 'Naviforce NF6108 (Dama)',        costoUnitario:  70000, costoAdicional: 25028, precioPublico: 149000, precioCierre: 129000 },
];

@Injectable()
export class PreciosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.precioProducto.findMany({ orderBy: { modelo: 'asc' } });
    return items.map((p) => ({
      ...p,
      gananciaMinima: p.precioCierre != null ? p.precioCierre - p.costoTotal : null,
    }));
  }

  create(dto: CreatePrecioDto) {
    const costoTotal = dto.costoUnitario + dto.costoAdicional;
    return this.prisma.precioProducto.create({
      data: {
        modelo: dto.modelo,
        costoUnitario: dto.costoUnitario,
        costoAdicional: dto.costoAdicional,
        costoTotal,
        precioPublico: dto.precioPublico ?? null,
        precioCierre: dto.precioCierre ?? null,
      },
    });
  }

  async update(id: string, dto: UpdatePrecioDto) {
    const existing = await this.prisma.precioProducto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Producto ${id} no encontrado`);

    const costoUnitario = dto.costoUnitario ?? existing.costoUnitario;
    const costoAdicional = dto.costoAdicional ?? existing.costoAdicional;

    return this.prisma.precioProducto.update({
      where: { id },
      data: {
        costoUnitario,
        costoAdicional,
        costoTotal: costoUnitario + costoAdicional,
        precioPublico: dto.precioPublico !== undefined ? dto.precioPublico : existing.precioPublico,
        precioCierre: dto.precioCierre !== undefined ? dto.precioCierre : existing.precioCierre,
      },
    });
  }

  async seedFromExcel() {
    const modelosExcel = PRECIOS_EXCEL.map((p) => p.modelo);

    // Modelos activos en compras (no eliminar sus entradas de precios)
    const compras = await this.prisma.purchase.findMany({ select: { modelo: true } });
    const modelosCompras = [...new Set(compras.map((c) => c.modelo))];

    const modelosValidos = [...new Set([...modelosExcel, ...modelosCompras])];

    // Eliminar entradas que ya no pertenecen a ninguna fuente válida
    await this.prisma.precioProducto.deleteMany({
      where: { modelo: { notIn: modelosValidos } },
    });

    let upsertados = 0;
    for (const p of PRECIOS_EXCEL) {
      const costoTotal = p.costoUnitario + p.costoAdicional;
      await this.prisma.precioProducto.upsert({
        where: { modelo: p.modelo },
        update: {
          costoUnitario: p.costoUnitario,
          costoAdicional: p.costoAdicional,
          costoTotal,
          precioPublico: p.precioPublico,
          precioCierre: p.precioCierre,
        },
        create: {
          modelo: p.modelo,
          costoUnitario: p.costoUnitario,
          costoAdicional: p.costoAdicional,
          costoTotal,
          precioPublico: p.precioPublico,
          precioCierre: p.precioCierre,
        },
      });
      upsertados++;
    }
    return { seeded: upsertados };
  }
}
