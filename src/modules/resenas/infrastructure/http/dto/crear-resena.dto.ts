import type { CrearResenaCommand } from '../../../application/resenas.service';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LIMITES_RESENA } from '../../../domain/resena';

// Aquí solo se corta lo groseramente inválido antes de tocar la base. Los
// límites exactos de texto los aplica el dominio después de normalizar
// (espacios y saltos de línea), por eso el tope del DTO es más holgado.
export class CrearResenaDto implements CrearResenaCommand {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  productId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(LIMITES_RESENA.calificacionMin)
  @Max(LIMITES_RESENA.calificacionMax)
  calificacion: number;

  @ApiPropertyOptional({ maxLength: LIMITES_RESENA.tituloMax })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITES_RESENA.tituloMax * 2)
  titulo?: string;

  @ApiProperty({
    minLength: LIMITES_RESENA.comentarioMin,
    maxLength: LIMITES_RESENA.comentarioMax,
  })
  @IsString()
  @MaxLength(LIMITES_RESENA.comentarioMax * 2)
  comentario: string;
}
