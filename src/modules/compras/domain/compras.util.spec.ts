import { costoTotalCompra, planCompraUpdate } from './compras.util';

describe('costoTotalCompra', () => {
  it('multiplica cantidad por costo unitario', () => {
    expect(costoTotalCompra(5, 900)).toBe(4500);
  });
});

describe('planCompraUpdate', () => {
  const existente = {
    fecha: new Date('2026-01-01'),
    marca: 'Rolex',
    modelo: 'Submariner',
    cantidad: 5,
    costoUnitario: 900,
    categoria: 'Reloj',
  };

  it('sin dto, conserva todos los valores existentes', () => {
    const plan = planCompraUpdate(existente, {});

    expect(plan).toMatchObject({
      fecha: existente.fecha,
      marca: 'Rolex',
      modelo: 'Submariner',
      cantidad: 5,
      costoUnitario: 900,
      categoria: 'Reloj',
      modeloCambio: false,
      identidadCambio: false,
      actualizarPrecio: false,
    });
  });

  it('recalcula costoTotal con los valores mezclados', () => {
    const plan = planCompraUpdate(existente, { cantidad: 10 });
    expect(plan.costoTotal).toBe(9000); // 10 * 900
  });

  it('cambiar el modelo marca modeloCambio e identidadCambio', () => {
    const plan = planCompraUpdate(existente, { modelo: 'GMT-Master' });
    expect(plan.modeloCambio).toBe(true);
    expect(plan.identidadCambio).toBe(true);
  });

  it('cambiar solo la marca marca identidadCambio pero no modeloCambio', () => {
    const plan = planCompraUpdate(existente, { marca: 'Tudor' });
    expect(plan.modeloCambio).toBe(false);
    expect(plan.identidadCambio).toBe(true);
  });

  it('modelo igual al existente no cuenta como cambio', () => {
    const plan = planCompraUpdate(existente, { modelo: 'Submariner' });
    expect(plan.modeloCambio).toBe(false);
    expect(plan.identidadCambio).toBe(false);
  });

  it('cambiar solo costoUnitario activa actualizarPrecio sin tocar identidad', () => {
    const plan = planCompraUpdate(existente, { costoUnitario: 950 });
    expect(plan.actualizarPrecio).toBe(true);
    expect(plan.identidadCambio).toBe(false);
  });

  it('sin cambios de costo ni identidad, no hay que tocar precios', () => {
    const plan = planCompraUpdate(existente, { cantidad: 8 });
    expect(plan.actualizarPrecio).toBe(false);
  });

  it('con fecha en el dto, la parsea; sin ella, conserva la existente', () => {
    const conFecha = planCompraUpdate(existente, { fecha: '2026-03-01' });
    expect(conFecha.fecha).toEqual(new Date('2026-03-01'));

    const sinFecha = planCompraUpdate(existente, {});
    expect(sinFecha.fecha).toBe(existente.fecha);
  });
});
