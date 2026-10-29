import { BusinessRuleViolation } from '../../../shared/domain/domain-error';
import { fakeEventBus } from '../../../shared/testing/fakes';
import {
  MercanciaIngresada,
  SalidaPorPedidoRegistrada,
  StockAgotado,
  StockRepuesto,
} from '../domain/inventario-events';
import { MovimientosService } from './movimientos.service';

// Reemplaza a los specs que mockeaban el TransactionClient en los
// repositorios de orders, ventas y compras: las reglas de stock ahora viven
// aquí y se prueban contra un repositorio en memoria.
const submariner = {
  id: 'inv-1',
  marca: 'Rolex',
  modelo: 'Submariner',
  stock: 5,
  costoUnitario: 600,
  categoria: 'Reloj',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeService(item: typeof submariner | null = submariner) {
  const repo = {
    findAll: jest.fn(),
    findStockPublico: jest.fn(),
    findByModelo: jest.fn().mockResolvedValue(item),
    buscarPorModelo: jest.fn().mockResolvedValue(item),
    descontar: jest.fn().mockResolvedValue(3),
    incrementar: jest.fn().mockResolvedValue(7),
    ajustarStockPorModelo: jest.fn(),
    registrarIngreso: jest.fn(),
    corregirPorModelo: jest.fn(),
    applySeed: jest.fn(),
  };
  const events = fakeEventBus();
  const service = new MovimientosService(repo, events);
  return { service, repo, events };
}

const pedido = {
  orderId: 'order-1',
  cliente: 'Cliente Test',
  celular: '3000000000',
  lineas: [
    {
      productId: 'prod-1',
      nombre: 'Rolex Submariner',
      marca: 'Rolex',
      modelo: 'Submariner',
      cantidad: 2,
      precioUnitario: 1000,
    },
  ],
};

describe('MovimientosService.salidaPorPedido', () => {
  it('descuenta stock atomicamente buscando por modelo con fallback al nombre legado', async () => {
    const { service, repo } = makeService();

    await service.salidaPorPedido(pedido);

    expect(repo.buscarPorModelo).toHaveBeenCalledWith(
      'Submariner',
      'Rolex Submariner',
    );
    expect(repo.descontar).toHaveBeenCalledWith('inv-1', 2);
  });

  it('publica la salida con el costo unitario para que ventas la registre', async () => {
    const { service, events } = makeService();

    await service.salidaPorPedido(pedido);

    expect(events.of(SalidaPorPedidoRegistrada)[0].salida).toEqual({
      orderId: 'order-1',
      cliente: 'Cliente Test',
      celular: '3000000000',
      lineas: [
        {
          marca: 'Rolex',
          modelo: 'Submariner',
          cantidad: 2,
          precioUnitario: 1000,
          costoUnitario: 600,
        },
      ],
    });
  });

  it('si el stock ya no alcanza, lanza y no publica la salida (la confirmacion se revierte)', async () => {
    const { service, repo, events } = makeService();
    repo.descontar.mockResolvedValue(null);

    await expect(service.salidaPorPedido(pedido)).rejects.toThrow(
      new BusinessRuleViolation(
        'Stock insuficiente para "Rolex Submariner" (disponible: 5, solicitado: 2).',
      ),
    );
    expect(events.of(SalidaPorPedidoRegistrada)).toHaveLength(0);
  });

  it('cuando el stock llega a cero, avisa StockAgotado con el nombre exacto del producto', async () => {
    const { service, repo, events } = makeService();
    repo.descontar.mockResolvedValue(0);

    await service.salidaPorPedido(pedido);

    expect(events.of(StockAgotado)[0].ref).toEqual({
      marca: 'Rolex',
      modelo: 'Submariner',
      nombreProducto: 'Rolex Submariner',
    });
  });

  it('las lineas no rastreadas en inventario no mueven stock ni generan venta', async () => {
    const { service, repo, events } = makeService(null);

    await service.salidaPorPedido(pedido);

    expect(repo.descontar).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe('MovimientosService.revertirSalidaPorPedido', () => {
  it('devuelve el stock reservado y avisa que hay stock de nuevo', async () => {
    const { service, repo, events } = makeService();

    await service.revertirSalidaPorPedido(pedido.lineas);

    expect(repo.incrementar).toHaveBeenCalledWith('inv-1', 2);
    expect(events.of(StockRepuesto)).toHaveLength(1);
  });
});

describe('MovimientosService ventas manuales', () => {
  const ref = { marca: 'Rolex', modelo: 'Submariner' };

  it('una venta manual descuenta 1 unidad del modelo', async () => {
    const { service, repo } = makeService();

    await service.salidaPorVentaManual(ref);

    expect(repo.descontar).toHaveBeenCalledWith('inv-1', 1);
  });

  it('sin stock, la venta manual se rechaza con el nombre "marca modelo"', async () => {
    const { service, repo } = makeService();
    repo.descontar.mockResolvedValue(null);

    await expect(service.salidaPorVentaManual(ref)).rejects.toThrow(
      'Stock insuficiente para "Rolex Submariner".',
    );
  });

  it('si el modelo no esta rastreado, no toca stock ni lanza', async () => {
    const { service, repo } = makeService(null);

    await expect(service.salidaPorVentaManual(ref)).resolves.toBeUndefined();
    expect(repo.descontar).not.toHaveBeenCalled();
  });

  it('si queda stock, no cambia la disponibilidad del catalogo', async () => {
    const { service, events } = makeService();

    await service.salidaPorVentaManual(ref);

    expect(events.publish).not.toHaveBeenCalled();
  });

  it('al borrar la venta devuelve la unidad y, con stock positivo, avisa StockRepuesto', async () => {
    const { service, repo, events } = makeService();

    await service.revertirVentaManual(ref);

    expect(repo.ajustarStockPorModelo).toHaveBeenCalledWith('Submariner', 1);
    expect(events.of(StockRepuesto)[0].ref).toEqual({
      ...ref,
      nombreProducto: null,
    });
  });

  it('si el modelo no esta en inventario, no intenta re-habilitar nada', async () => {
    const { service, events } = makeService(null);

    await service.revertirVentaManual(ref);

    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe('MovimientosService compras', () => {
  const compra = {
    marca: 'Rolex',
    modelo: 'Submariner',
    cantidad: 5,
    costoUnitario: 900,
    categoria: 'Reloj',
  };

  it('una compra suma stock y avisa al catalogo con el stock resultante', async () => {
    const { service, repo, events } = makeService();

    await service.ingresoPorCompra(compra);

    expect(repo.registrarIngreso).toHaveBeenCalledWith(compra);
    expect(events.of(MercanciaIngresada)[0].ingreso).toEqual({
      marca: 'Rolex',
      modelo: 'Submariner',
      categoria: 'Reloj',
      stock: 5,
      renombradoDesde: null,
    });
  });

  it('corregir la cantidad sin cambiar el modelo ajusta el stock por la diferencia', async () => {
    const { service, repo } = makeService();

    await service.correccionDeCompra({
      anterior: { marca: 'Rolex', modelo: 'Submariner', cantidad: 5 },
      nueva: { ...compra, cantidad: 8 },
      modeloCambio: false,
      identidadCambio: false,
    });

    expect(repo.corregirPorModelo).toHaveBeenCalledWith('Submariner', {
      marca: 'Rolex',
      deltaStock: 3,
      costoUnitario: 900,
      categoria: 'Reloj',
    });
    expect(repo.registrarIngreso).not.toHaveBeenCalled();
  });

  it('cambiar el modelo descuenta del viejo, suma al nuevo y avisa el renombre', async () => {
    const { service, repo, events } = makeService();

    await service.correccionDeCompra({
      anterior: { marca: 'Rolex', modelo: 'Submariner', cantidad: 5 },
      nueva: { ...compra, modelo: 'Daytona', cantidad: 2 },
      modeloCambio: true,
      identidadCambio: true,
    });

    expect(repo.ajustarStockPorModelo).toHaveBeenCalledWith('Submariner', -5);
    expect(repo.registrarIngreso).toHaveBeenCalledWith(
      expect.objectContaining({ modelo: 'Daytona', cantidad: 2 }),
    );
    expect(events.of(MercanciaIngresada)[0].ingreso.renombradoDesde).toEqual({
      marca: 'Rolex',
      modelo: 'Submariner',
    });
  });
});
