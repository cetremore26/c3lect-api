import {
  agruparComprasPorModelo,
  calcularStock,
  capitalItem,
  contarVentasPorModelo,
} from './inventario.util';

describe('agruparComprasPorModelo', () => {
  it('suma la cantidad comprada de todas las compras del mismo modelo', () => {
    const resultado = agruparComprasPorModelo([
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 2,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 3,
        costoUnitario: 650,
        categoria: 'Reloj',
      },
    ]);

    expect(resultado.Submariner.cantidad).toBe(5);
  });

  it('usa el costoUnitario de la compra mas reciente (ultima del arreglo)', () => {
    const resultado = agruparComprasPorModelo([
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 1,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 1,
        costoUnitario: 650,
        categoria: 'Reloj',
      },
    ]);

    expect(resultado.Submariner.costoUnitario).toBe(650);
  });

  it('usa la marca mas reciente no nula, sin perderla si una compra posterior no trae marca', () => {
    const resultado = agruparComprasPorModelo([
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 1,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
      {
        marca: null,
        modelo: 'Submariner',
        cantidad: 1,
        costoUnitario: 650,
        categoria: 'Reloj',
      },
    ]);

    expect(resultado.Submariner.marca).toBe('Rolex');
  });

  it('agrupa por separado modelos distintos', () => {
    const resultado = agruparComprasPorModelo([
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 1,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
      {
        marca: 'Casio',
        modelo: 'G-Shock',
        cantidad: 4,
        costoUnitario: 80,
        categoria: 'Reloj',
      },
    ]);

    expect(Object.keys(resultado).sort()).toEqual(['G-Shock', 'Submariner']);
    expect(resultado['G-Shock'].cantidad).toBe(4);
  });
});

describe('contarVentasPorModelo', () => {
  it('cuenta una venta por cada fila, incluidas las de precio cero', () => {
    const resultado = contarVentasPorModelo([
      { modelo: 'Submariner' },
      { modelo: 'Submariner' },
      { modelo: 'G-Shock' },
    ]);

    expect(resultado.Submariner).toBe(2);
    expect(resultado['G-Shock']).toBe(1);
  });

  it('devuelve un objeto vacio sin ventas', () => {
    expect(contarVentasPorModelo([])).toEqual({});
  });
});

describe('calcularStock', () => {
  it('resta las unidades vendidas a las compradas', () => {
    expect(calcularStock(10, 4)).toBe(6);
  });

  it('nunca baja de cero aunque se hayan vendido mas de las compradas', () => {
    expect(calcularStock(3, 5)).toBe(0);
  });
});

describe('capitalItem', () => {
  it('multiplica stock por costo unitario', () => {
    expect(capitalItem(5, 600)).toBe(3000);
  });
});
