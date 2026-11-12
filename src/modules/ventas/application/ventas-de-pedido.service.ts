import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../shared/application/ports/event-bus.port';
import { diaDeNegocioComoFecha } from '../../../shared/domain/fecha-negocio';
import { calcGananciaPorVenta } from '../domain/ganancia';
import { VentasDePedidoAnuladas } from '../domain/venta-events';
import { agruparUnidadesPorModelo } from '../domain/ventas.util';
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
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async registrar(salida: SalidaDePedido): Promise<void> {
    const fecha = diaDeNegocioComoFecha();
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

  // Las filas registradas son la verdad de lo que se despachó (inventario solo
  // publica la salida de las líneas que rastrea): se borran y se avisa
  // exactamente eso para que inventario lo reponga. Sin filas (pedido sin
  // productos en inventario) no hay nada que reponer.
  async anular(orderId: string): Promise<void> {
    const ventas = await this.ventasRepository.findByOrderId(orderId);
    if (ventas.length === 0) return;

    await this.ventasRepository.removeByOrderId(orderId);
    await this.events.publish(
      new VentasDePedidoAnuladas({
        orderId,
        lineas: agruparUnidadesPorModelo(ventas),
      }),
    );
  }
}
