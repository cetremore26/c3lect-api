import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EstadoResena } from '../../../domain/resena';

export class CambiarEstadoResenaDto {
  @ApiProperty({ enum: EstadoResena })
  @IsEnum(EstadoResena)
  estado: EstadoResena;
}
