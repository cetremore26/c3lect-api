import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePrecioDto {
  @ApiProperty()
  @IsString()
  marca: string;

  @ApiProperty()
  @IsString()
  modelo: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  costoUnitario: number;

  @ApiProperty({ default: 25028 })
  @IsInt()
  @Min(0)
  costoAdicional: number;

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
