// El negocio opera en Colombia (UTC-5, sin horario de verano). Todo "día" de
// negocio (número de pedido, filtros por fecha, fecha de venta) se calcula
// aquí y no con la zona horaria del servidor.
export const ZONA_NEGOCIO = 'America/Bogota';

const formateador = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día calendario en Bogotá, formato 'YYYY-MM-DD'. */
export function diaDeNegocio(instante: Date = new Date()): string {
  const partes = formateador.formatToParts(instante);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function inicioDelDiaDeNegocio(dia: string): Date {
  return new Date(`${dia}T00:00:00.000-05:00`);
}

export function finDelDiaDeNegocio(dia: string): Date {
  return new Date(`${dia}T23:59:59.999-05:00`);
}

/** Medianoche UTC del día de Bogotá, para columnas `@db.Date`. */
export function diaDeNegocioComoFecha(instante: Date = new Date()): Date {
  return new Date(`${diaDeNegocio(instante)}T00:00:00.000Z`);
}
