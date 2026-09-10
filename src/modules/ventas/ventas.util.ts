import { calcGananciaPorVenta } from '../metrics/metrics.service';

export function calcularSaldoPendiente(
  precioVenta: number,
  abono: number,
): number {
  return precioVenta > 0 ? Math.max(0, precioVenta - abono) : 0;
}

const CANALES_DIGITALES = ['WhatsApp', 'Instagram'];

// Le devuelve a Meta la señal de las ventas que se cierran por chat — sin
// esto, Meta solo ve las compras del checkout web y optimiza las campañas
// hacia el público equivocado. Condiciones: canal digital que la pauta pueda
// influir, celular para identificar al cliente, y venta real (precioVenta>0
// excluye "Uso Personal").
export function esElegibleParaMetaOffline(venta: {
  fuente?: string | null;
  celular?: string | null;
  precioVenta: number;
}): boolean {
  return Boolean(
    venta.fuente &&
    CANALES_DIGITALES.includes(venta.fuente) &&
    venta.celular &&
    venta.precioVenta > 0,
  );
}

export interface VentaExistente {
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
  fuente: string | null;
  estado: string;
}

export interface VentaUpdateDto {
  fecha?: string;
  cliente?: string;
  celular?: string;
  marca?: string;
  modelo?: string;
  estilo?: string;
  precioVenta?: number;
  costoProducto?: number;
  costoEnvio?: number;
  abono?: number;
  fuente?: string;
  estado?: string;
}

export interface VentaUpdatePlan {
  fecha: Date;
  cliente: string;
  celular: string | null;
  marca: string | null;
  modelo: string;
  estilo: string | null;
  fuente: string | null;
  precioVenta: number;
  costoProducto: number;
  costoEnvio: number;
  abono: number;
  saldoPendiente: number;
  gananciaNeta: number;
  estado: string;
}

// Igual que planCompraUpdate: toda la decisión de "con qué valores queda la
// venta tras el patch" en un solo lugar puro, incluido el auto-cierre a
// "Pagado" cuando el abono alcanza o supera el precio.
export function planVentaUpdate(
  existing: VentaExistente,
  dto: VentaUpdateDto,
): VentaUpdatePlan {
  const precioVenta = dto.precioVenta ?? existing.precioVenta;
  const costoProducto = dto.costoProducto ?? existing.costoProducto;
  const costoEnvio = dto.costoEnvio ?? existing.costoEnvio;
  const abono = dto.abono ?? existing.abono;

  let estado = dto.estado ?? existing.estado;
  if (precioVenta > 0 && abono >= precioVenta) {
    estado = 'Pagado';
  }

  const saldoPendiente = calcularSaldoPendiente(precioVenta, abono);
  const gananciaNeta = calcGananciaPorVenta(
    estado,
    precioVenta,
    costoProducto,
    costoEnvio,
    abono,
  );

  return {
    fecha: dto.fecha ? new Date(dto.fecha) : existing.fecha,
    cliente: dto.cliente ?? existing.cliente,
    celular: dto.celular !== undefined ? dto.celular : existing.celular,
    marca: dto.marca ?? existing.marca,
    modelo: dto.modelo ?? existing.modelo,
    estilo: dto.estilo !== undefined ? dto.estilo : existing.estilo,
    fuente: dto.fuente !== undefined ? dto.fuente : existing.fuente,
    precioVenta,
    costoProducto,
    costoEnvio,
    abono,
    saldoPendiente,
    gananciaNeta,
    estado,
  };
}
