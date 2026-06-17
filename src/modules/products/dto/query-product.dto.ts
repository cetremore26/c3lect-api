import { IsOptional, IsString, IsBoolean, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum RangoPrecio {
  BAJO  = '0-150',
  MEDIO = '150-300',
  ALTO  = '300+',
}

export class QueryProductDto {
  @ApiPropertyOptional({ example: 'reloj' })
  @IsOptional()
  @IsString()
  categoria?: string;

  @ApiPropertyOptional({ example: 'Fossil' })
  @IsOptional()
  @IsString()
  marca?: string;

  @ApiPropertyOptional({ example: 'Hombre' })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({ description: 'Si se envía, la respuesta queda paginada como { data, meta }', minimum: 1 })
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
}
