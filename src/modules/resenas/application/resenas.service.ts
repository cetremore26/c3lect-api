import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import {
  EstadoResena,
  nombrePublico,
  normalizarRespuesta,
  validarContenido,
} from '../domain/resena';
import { AUTORES } from './ports/autores.port';
import type { AutoresPort } from './ports/autores.port';
import { COMPRAS_DEL_CLIENTE } from './ports/compras-del-cliente.port';
import type {
  ComprasDelClientePort,
  ProductoRecibido,
} from './ports/compras-del-cliente.port';
import { RESENAS_REPOSITORY } from './ports/resenas-repository.port';
import type {
  FiltroResenas,
  ResenasRepositoryPort,
} from './ports/resenas-repository.port';

export interface CrearResenaCommand {
  productId: string;
  calificacion: number;
  titulo?: string;
  comentario: string;
}

export interface ListarResenasQuery extends FiltroResenas {
  page?: number;
  limit?: number;
}

// La lectura pública de reseñas no pasa por aquí: la tienda lee la vista
// `resenas_publicas` de Supabase (migración 20261105000000). Este servicio
// cubre lo que necesita identidad: escribir, saber qué falta por reseñar y
// moderar desde el panel.
@Injectable()
export class ResenasService {
  constructor(
    @Inject(RESENAS_REPOSITORY)
    private readonly resenas: ResenasRepositoryPort,
    @Inject(COMPRAS_DEL_CLIENTE)
    private readonly compras: ComprasDelClientePort,
    @Inject(AUTORES) private readonly autores: AutoresPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  /** Productos que el cliente recibió y todavía no reseñó. */
  async pendientes(userId: string): Promise<ProductoRecibido[]> {
    const [recibidos, resenados] = await Promise.all([
      this.compras.productosRecibidos(userId),
      this.resenas.productosResenados(userId),
    ]);
    const yaResenados = new Set(resenados);
    return recibidos.filter((p) => !yaResenados.has(p.productId));
  }

  async crear(userId: string, cmd: CrearResenaCommand) {
    const contenido = validarContenido(cmd);

    const recibido = (await this.compras.productosRecibidos(userId)).find(
      (p) => p.productId === cmd.productId,
    );
    if (!recibido) {
      throw new ForbiddenError(
        'Solo puedes reseñar productos de un pedido que ya recibiste',
      );
    }

    const resenados = await this.resenas.productosResenados(userId);
    if (resenados.includes(cmd.productId)) {
      throw new ConflictError('Ya reseñaste este producto');
    }

    const autor = await this.autores.nombreDe(userId);
    return this.resenas.create({
      ...contenido,
      productId: cmd.productId,
      productoNombre: recibido.nombre,
      userId,
      autorNombre: nombrePublico(autor),
    });
  }

  async listar(query: ListarResenasQuery) {
    const { estado, page = 1, limit = 20 } = query;
    const { data, total } = await this.resenas.findMany(
      { estado },
      (page - 1) * limit,
      limit,
    );
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async cambiarEstado(id: string, estado: EstadoResena, adminId?: string) {
    const actual = await this.findExisting(id);
    if (actual.estado === estado) return actual;

    const resena = await this.resenas.update(id, { estado });
    await this.audit.log(
      'ESTADO',
      'resena',
      id,
      `Reseña de ${resena.autorNombre} sobre ${resena.productoNombre}: ${
        estado === EstadoResena.OCULTA ? 'ocultada' : 'publicada'
      }`,
      adminId,
    );
    return resena;
  }

  async responder(id: string, texto: string, adminId?: string) {
    await this.findExisting(id);
    const respuesta = normalizarRespuesta(texto);

    const resena = await this.resenas.update(id, {
      respuesta,
      respondidaAt: respuesta ? new Date() : null,
    });
    await this.audit.log(
      'EDITAR',
      'resena',
      id,
      `${respuesta ? 'Respuesta publicada' : 'Respuesta retirada'} en la reseña de ${resena.autorNombre} sobre ${resena.productoNombre}`,
      adminId,
    );
    return resena;
  }

  private async findExisting(id: string) {
    const resena = await this.resenas.findById(id);
    if (!resena) throw new NotFoundError(`Reseña ${id} no encontrada`);
    return resena;
  }
}
