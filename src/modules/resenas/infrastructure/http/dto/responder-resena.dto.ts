import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { LIMITES_RESENA } from '../../../domain/resena';

export class ResponderResenaDto {
  @ApiProperty({ description: 'Texto vacío retira la respuesta' })
  @IsString()
  @MaxLength(LIMITES_RESENA.respuestaMax * 2)
  respuesta: string;
}
