import type { CreatePrecioCommand } from '../../../application/precios.service';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePrecioDto implements CreatePrecioCommand {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  marca: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  modelo: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  costoUnitario: number;

  @ApiPropertyOptional({
    description:
      'Si se omite, el backend aplica el costo adicional por defecto',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  costoAdicional?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  precioPublico?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  precioCierre?: number;
}
