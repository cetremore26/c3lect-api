export const FUENTES_DE_MARCAS = Symbol('FUENTES_DE_MARCAS');

// Las marcas no tienen tabla propia: salen del catálogo y de las compras.
// Cada fuente es de otro contexto y se consulta por su API pública.
export interface FuenteDeMarcasPort {
  marcas(): Promise<string[]>;
}
