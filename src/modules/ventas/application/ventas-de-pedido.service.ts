import { Inject, Injectable } from '@nestjs/common';
import { calcGananciaPorVenta } from '../domain/ganancia';
import { VENTAS_REPOSITORY } from './ports/ventas-repository.port';
import type { VentasRepositoryPort } from './ports/ventas-repository.port';

export interface SalidaDePedido {
  orderId: string;
  cliente: string;
  celular: string | null;
  lineas: {
    marca: string | null;
    modelo: string;
    cantidad: number;
    precioUnitario: number;
    costoUnitario: number;
  }[];
}

// Ventas que nacen de un pedido de la plataforma: una fila por unidad
// (fuente "Plataforma"), igual que el registro manual. Se asume pago completo:
// o ya aprobó MercadoPago, o el admin confirma a mano tras cobrar contra
// entrega.
@Injectable()
export class VentasDePedidoService {
  constructor(
    @Inject(VENTAS_REPOSITORY)
    private readonly ventasRepository: VentasRepositoryPort,
  ) {}

  async registrar(salida: SalidaDePedido): Promise<void> {
    const fecha = new Date();
    const filas = salida.lineas.flatMap((linea) => {
      const gananciaNeta = calcGananciaPorVenta(
        'Pagado',
        linea.precioUnitario,
        linea.costoUnitario,
        0,
        linea.precioUnitario,
      );
      return Array.from({ length: linea.cantidad }, () => ({
        orderId: salida.orderId,
        fecha,
        cliente: salida.cliente,
        celular: salida.celular,
        marca: linea.marca,
        modelo: linea.modelo,
        estilo: null,
        precioVenta: linea.precioUnitario,
        costoProducto: linea.costoUnitario,
        costoEnvio: 0,
        abono: linea.precioUnitario,
        saldoPendiente: 0,
        gananciaNeta,
        fuente: 'Plataforma',
        estado: 'Pagado',
      }));
    });
    await this.ventasRepository.createMany(filas);
  }

  anular(orderId: string): Promise<void> {
    return this.ventasRepository.removeByOrderId(orderId);
  }
}
