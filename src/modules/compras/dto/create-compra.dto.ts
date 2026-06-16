import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsString, Min } from 'class-validator';

export enum CategoriaCompra {
  Reloj = 'Reloj',
  Perfume = 'Perfume',
  Accesorio = 'Accesorio',
}

export class CreateCompraDto {
  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  fecha: string;

  @ApiProperty()
  @IsString()
  modelo: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  cantidad: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  costoUnitario: number;

  @ApiProperty({ enum: CategoriaCompra })
  @IsEnum(CategoriaCompra)
  categoria: CategoriaCompra;
}
