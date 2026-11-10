import { Transform } from 'class-transformer';

/** Normaliza un email de entrada: sin espacios y en minúsculas. */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}
