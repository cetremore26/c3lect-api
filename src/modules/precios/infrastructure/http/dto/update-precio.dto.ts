import type { UpdatePrecioCommand } from '../../../application/precios.service';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePrecioDto implements UpdatePrecioCommand {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  costoUnitario?: number;

  @ApiPropertyOptional()
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
