import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsInt, IsBoolean, IsOptional,
  IsPositive, MinLength, IsArray, Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'r-fossil-chicago' })
  @IsString()
  @MinLength(2)
  id: string;

  @ApiProperty({ example: 'Fossil Chicago' })
  @IsString()
  @MinLength(2)
  nombre: string;

  @ApiProperty({ example: 'Acero' })
  @IsString()
  estilo: string;

  @ApiProperty({ example: 'Fossil Chicago — Acero' })
  @IsString()
  display: string;

  @ApiProperty({ example: 349000 })
  @IsInt()
  @IsPositive()
  precio: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  disponible?: boolean;

  @ApiProperty({ example: 'reloj', enum: ['reloj', 'perfume', 'accesorio'] })
  @IsString()
  cat: string;

  @ApiPropertyOptional({ example: 'Fossil' })
  @IsOptional()
  @IsString()
  marca?: string;

  @ApiPropertyOptional({ example: 'Hombre', enum: ['Hombre', 'Mujer', 'Unisex'] })
  @IsOptional()
  @IsString()
  genero?: string;

  @ApiPropertyOptional({ example: ['images/relojes/fossil-chicago-1.webp'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imgs?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() specMovimiento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specDimensiones?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specCaja?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specCorrea?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specCristal?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specFunciones?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specResistenciaAgua?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specPeso?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specBateria?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specReservaMarcha?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specObservaciones?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notasDescripcion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notasTop?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notasCorazon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notasBase?: string;
}
