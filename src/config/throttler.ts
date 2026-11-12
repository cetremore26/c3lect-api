import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';

// @nestjs/throttler 6.5 aplica TODOS los throttlers con nombre a todas las
// rutas. @Throttle({ auth: ... }) guarda el límite con Reflect.defineMetadata
// bajo la clave THROTTLER_LIMIT + nombre ('THROTTLER:LIMIT' + 'auth'; ver
// node_modules/@nestjs/throttler/dist/throttler.constants.js). El índice del
// paquete no exporta THROTTLER_LIMIT, así que la clave se escribe literal.
const CLAVE_LIMITE_AUTH = 'THROTTLER:LIMIT' + 'auth';

/** true si el handler o su clase declaran `@Throttle({ auth: ... })`. */
export function declaraLimiteAuth(context: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(CLAVE_LIMITE_AUTH, context.getHandler()) !==
      undefined ||
    Reflect.getMetadata(CLAVE_LIMITE_AUTH, context.getClass()) !== undefined
  );
}

export const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'default', ttl: 60000, limit: 300 },
    {
      name: 'auth',
      ttl: 60000,
      limit: 8,
      // 'auth' solo rige donde una ruta lo declara con @Throttle({ auth })
      skipIf: (context) => !declaraLimiteAuth(context),
    },
  ],
};
