import {
  calcularSaldoPendiente,
  esElegibleParaMetaOffline,
  planVentaUpdate,
} from './ventas.util';

describe('calcularSaldoPendiente', () => {
  it('resta el abono al precio', () => {
    expect(calcularSaldoPendiente(1000, 400)).toBe(600);
  });

  it('nunca baja de cero aunque el abono supere el precio', () => {
    expect(calcularSaldoPendiente(1000, 1500)).toBe(0);
  });

  it('con precioVenta 0 (Uso Personal), el saldo siempre es 0', () => {
    expect(calcularSaldoPendiente(0, 0)).toBe(0);
  });
});

describe('esElegibleParaMetaOffline', () => {
  it('elegible: canal digital + celular + venta real', () => {
    expect(
      esElegibleParaMetaOffline({
        fuente: 'WhatsApp',
        celular: '3000000000',
        precioVenta: 1000,
      }),
    ).toBe(true);
    expect(
      esElegibleParaMetaOffline({
        fuente: 'Instagram',
        celular: '3000000000',
        precioVenta: 1000,
      }),
    ).toBe(true);
  });

  it('no elegible: fuente no digital', () => {
    expect(
      esElegibleParaMetaOffline({
        fuente: 'Presencial',
        celular: '3000000000',
        precioVenta: 1000,
      }),
    ).toBe(false);
  });

  it('no elegible: sin celular', () => {
    expect(
      esElegibleParaMetaOffline({
        fuente: 'WhatsApp',
        celular: undefined,
        precioVenta: 1000,
      }),
    ).toBe(false);
  });

  it('no elegible: Uso Personal (precioVenta 0)', () => {
    expect(
      esElegibleParaMetaOffline({
        fuente: 'WhatsApp',
        celular: '3000000000',
        precioVenta: 0,
      }),
    ).toBe(false);
  });
});

describe('planVentaUpdate', () => {
  const existente = {
    fecha: new Date('2026-01-01'),
    cliente: 'Ana',
    celular: '3000000000',
    marca: 'Rolex',
    modelo: 'Submariner',
    estilo: null,
    precioVenta: 1000,
    costoProducto: 600,
    costoEnvio: 0,
    abono: 400,
    fuente: 'WhatsApp',
    estado: 'Abonado',
  };

  it('sin dto, conserva todos los valores existentes', () => {
    const plan = planVentaUpdate(existente, {});
    expect(plan).toMatchObject({
      cliente: 'Ana',
      marca: 'Rolex',
      modelo: 'Submariner',
      precioVenta: 1000,
      costoProducto: 600,
      abono: 400,
      estado: 'Abonado',
    });
  });

  it('recalcula saldoPendiente y gananciaNeta con los valores mezclados', () => {
    const plan = planVentaUpdate(existente, { abono: 700 });
    expect(plan.saldoPendiente).toBe(300);
  });

  it('auto-cierra a Pagado cuando el abono alcanza el precio, sin importar el estado del dto', () => {
    const plan = planVentaUpdate(existente, {
      abono: 1000,
      estado: 'Pendiente',
    });
    expect(plan.estado).toBe('Pagado');
  });

  it('auto-cierra a Pagado cuando el abono supera el precio', () => {
    const plan = planVentaUpdate(existente, { abono: 1200 });
    expect(plan.estado).toBe('Pagado');
  });

  it('sin alcanzar el precio, respeta el estado que venga en el dto', () => {
    const plan = planVentaUpdate(existente, {
      abono: 500,
      estado: 'Pendiente',
    });
    expect(plan.estado).toBe('Pendiente');
  });

  it('Uso Personal (precioVenta 0) nunca se auto-cierra por abono', () => {
    const plan = planVentaUpdate(
      { ...existente, precioVenta: 0, abono: 0 },
      { estado: 'Uso Personal' },
    );
    expect(plan.estado).toBe('Uso Personal');
  });

  it('sin fecha en el dto, conserva la existente', () => {
    const plan = planVentaUpdate(existente, {});
    expect(plan.fecha).toBe(existente.fecha);
  });
});
