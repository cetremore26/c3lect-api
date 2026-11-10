/** Swagger (/api/docs) no se expone en producción. */
export function exponerSwagger(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}
