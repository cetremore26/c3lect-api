import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, validateSync } from 'class-validator';
import { Type } from 'class-transformer';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  FRONTEND_URL: string;

  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  RESEND_FROM?: string;

  @IsOptional()
  @IsString()
  ADMIN_EMAIL?: string;

  @IsString()
  @IsNotEmpty()
  MP_ACCESS_TOKEN: string;

  @IsString()
  @IsNotEmpty()
  MP_WEBHOOK_SECRET: string;

  @IsString()
  @IsNotEmpty()
  API_URL: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  // Meta Conversions API. Opcionales a propósito: si faltan, el servicio se
  // desactiva solo y la app arranca igual. Así el backend sigue funcionando
  // en local y en cualquier entorno donde no se quiera enviar eventos.
  @IsOptional()
  @IsString()
  META_PIXEL_ID?: string;

  @IsOptional()
  @IsString()
  META_CAPI_ACCESS_TOKEN?: string;

  @IsOptional()
  @IsString()
  META_CAPI_TEST_EVENT_CODE?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Variables de entorno inválidas:\n${errors.toString()}`);
  }
  return validated;
}
