import { Inject, Injectable } from '@nestjs/common';
import { FUENTES_DE_MARCAS } from './ports/fuentes-de-marcas.port';
import type { FuenteDeMarcasPort } from './ports/fuentes-de-marcas.port';

@Injectable()
export class MarcasService {
  constructor(
    @Inject(FUENTES_DE_MARCAS) private readonly fuentes: FuenteDeMarcasPort[],
  ) {}

  async findAll(): Promise<string[]> {
    const listas = await Promise.all(this.fuentes.map((f) => f.marcas()));
    const marcas = new Set(listas.flat());
    return Array.from(marcas).sort((a, b) => a.localeCompare(b, 'es'));
  }
}
