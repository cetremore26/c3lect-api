import { Inject, Injectable } from '@nestjs/common';
import { categoriaDesdeCapitalizada } from '../../../shared/domain/categoria.util';
import { combineMarcaModelo } from '../../../shared/domain/marca-modelo.util';
import { buildProductId } from '../domain/product-id';
import { PRODUCTS_REPOSITORY } from './ports/products-repository.port';
import type { ProductsRepositoryPort } from './ports/products-repository.port';

interface ModeloRef {
  marca: string | null;
  modelo: string;
}

// Cómo el catálogo reacciona a lo que pasa en inventario. Antes estas
// escrituras sobre `productos` vivían repartidas en los repositorios de
// compras, ventas y orders.
@Injectable()
export class CatalogSyncService {
  constructor(
    @Inject(PRODUCTS_REPOSITORY)
    private readonly products: ProductsRepositoryPort,
  ) {}

  /** Sin stock: todas las variantes del modelo dejan de estar disponibles. */
  agotar(ref: ModeloRef & { nombreProducto: string | null }): Promise<void> {
    return this.products.setDisponibilidadPorNombre(this.nombreDe(ref), false);
  }

  /** Volvió el stock: las variantes se habilitan de nuevo. */
  reponer(ref: ModeloRef & { nombreProducto: string | null }): Promise<void> {
    return this.products.setDisponibilidadPorNombre(this.nombreDe(ref), true);
  }

  // Si la compra corrigió marca/modelo, se renombra el producto existente en
  // vez de crear uno nuevo. Si no hay nada que renombrar (o no hubo
  // corrección), se sincroniza: crear un stub pendiente si no existe ninguna
  // variante, o habilitar las existentes. Solo con stock disponible.
  async sincronizarIngreso(ingreso: {
    marca: string | null;
    modelo: string;
    categoria: string;
    stock: number | null;
    renombradoDesde: ModeloRef | null;
  }): Promise<void> {
    if (ingreso.renombradoDesde) {
      const renombrados = await this.products.renombrar(
        combineMarcaModelo(
          ingreso.renombradoDesde.marca,
          ingreso.renombradoDesde.modelo,
        ),
        combineMarcaModelo(ingreso.marca, ingreso.modelo),
        ingreso.marca,
      );
      if (renombrados > 0) return;
    }

    if (ingreso.stock === null || ingreso.stock <= 0) return;

    const variantes = await this.products.findByMarcaModelo(
      ingreso.marca,
      ingreso.modelo,
    );

    if (variantes.length === 0) {
      const cat = categoriaDesdeCapitalizada(ingreso.categoria);
      const id = buildProductId(cat, ingreso.marca, ingreso.modelo);
      // Colisión de slug: el producto ya existe con otro nombre similar. Se
      // revisa antes en vez de atrapar el error del INSERT, que dejaría
      // abortada la transacción de la compra en Postgres.
      if (await this.products.existsId(id)) return;
      await this.products.createStub({
        id,
        nombre: combineMarcaModelo(ingreso.marca, ingreso.modelo),
        cat,
        marca: ingreso.marca,
      });
      return;
    }

    const deshabilitadas = variantes
      .filter((p) => !p.disponible)
      .map((p) => p.id);
    if (deshabilitadas.length > 0) await this.products.enable(deshabilitadas);

    const marca = ingreso.marca;
    if (marca) {
      const sinMarca = variantes.filter((p) => !p.marca).map((p) => p.id);
      if (sinMarca.length > 0) await this.products.setMarca(sinMarca, marca);
    }
  }

  private nombreDe(ref: ModeloRef & { nombreProducto: string | null }) {
    return ref.nombreProducto ?? combineMarcaModelo(ref.marca, ref.modelo);
  }
}
