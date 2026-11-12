const MONEDA_ESPERADA = 'COP';

/**
 * Compara lo que MercadoPago reporta como cobrado con el total del pedido.
 * Devuelve null si cuadra; si no, el motivo de la discrepancia.
 * Pura: sin Nest ni Prisma.
 */
export function discrepanciaDeMonto(
  cobro: {
    transactionAmount: number | undefined;
    currencyId: string | undefined;
  },
  totalEsperado: number,
): string | null {
  if (cobro.currencyId !== MONEDA_ESPERADA) {
    return cobro.currencyId === undefined
      ? `Moneda cobrada (sin moneda) distinta de ${MONEDA_ESPERADA}`
      : `Moneda cobrada ${cobro.currencyId} distinta de ${MONEDA_ESPERADA}`;
  }
  if (cobro.transactionAmount === undefined) {
    return `Monto cobrado (sin monto) distinto del total esperado ${totalEsperado}`;
  }
  if (cobro.transactionAmount !== totalEsperado) {
    return `Monto cobrado ${cobro.transactionAmount} distinto del total esperado ${totalEsperado}`;
  }
  return null;
}
