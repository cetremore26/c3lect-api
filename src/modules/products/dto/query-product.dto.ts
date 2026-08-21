import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsInt,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum RangoPrecio {
  BAJO = '0-150',
  MEDIO = '150-300',
  ALTO = '300+',
}

export enum ProductSortBy {
  PRECIO = 'precio',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class QueryProductDto {
  @ApiPropertyOptional({ example: 'reloj' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @ApiPropertyOptional({ example: 'Fossil' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  marca?: string;

  @ApiPropertyOptional({ example: 'Hombre' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  genero?: string;

  @ApiPropertyOptional({ enum: RangoPrecio, example: RangoPrecio.MEDIO })
  @IsOptional()
  @IsEnum(RangoPrecio)
  rangoPrecio?: RangoPrecio;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  soloDisponibles?: boolean;

  @ApiPropertyOptional({
    description: 'Solo productos marcados como destacados en el Home',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  destacado?: boolean;

  @ApiPropertyOptional({
    description:
      'Solo productos pendientes por completar (sin precio, imágenes o estilo)',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  incompletos?: boolean;

  @ApiPropertyOptional({
    description: 'Si se envía, la respuesta queda paginada como { data, meta }',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ProductSortBy, example: ProductSortBy.PRECIO })
  @IsOptional()
  @IsEnum(ProductSortBy)
  sortBy?: ProductSortBy;

  @ApiPropertyOptional({ enum: SortOrder, example: SortOrder.ASC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
