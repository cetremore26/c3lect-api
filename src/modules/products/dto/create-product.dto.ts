import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsIn,
  IsPositive,
  MinLength,
  MaxLength,
  IsArray,
  Min,
} from 'class-validator';
import { CATEGORIAS } from '../../../common/categoria.util';

export class CreateProductDto {
  @ApiProperty({ example: 'r-fossil-chicago' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  id: string;

  @ApiProperty({ example: 'Fossil Chicago' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ example: 'Acero' })
  @IsString()
  @MaxLength(150)
  estilo: string;

  @ApiProperty({ example: 'Fossil Chicago — Acero' })
  @IsString()
  @MaxLength(150)
  display: string;

  @ApiProperty({ example: 349000 })
  @IsInt()
  @IsPositive()
  precio: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  disponible?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'Aparece en el carrusel de temporada del Home (máx. 5 recomendados)',
  })
  @IsOptional()
  @IsBoolean()
  destacado?: boolean;

  @ApiProperty({ example: 'reloj', enum: CATEGORIAS })
  @IsIn(CATEGORIAS)
  cat: string;

  @ApiPropertyOptional({ example: 'Fossil' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  marca?: string;

  @ApiPropertyOptional({
    example: 'Hombre',
    enum: ['Hombre', 'Mujer', 'Unisex'],
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  genero?: string;

  @ApiPropertyOptional({
    example: ['images/relojes/fossil-chicago-1.webp'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  imgs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specMovimiento?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specDimensiones?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specCaja?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specCorrea?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specCristal?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specFunciones?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specResistenciaAgua?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specPeso?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specBateria?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specReservaMarcha?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specObservaciones?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notasDescripcion?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notasTop?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notasCorazon?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notasBase?: string;
}
