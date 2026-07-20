import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CATEGORIAS } from '../../../common/categoria.util';

export class QuerySalesDto extends PaginationQueryDto {
  // Override del límite heredado (máx. 50): el dashboard pide limit=200 para
  // traer de una vez todas las ventas pendientes/abonadas, y el export a CSV
  // de AdminVentas pide limit=1000 — ninguno es la tabla paginada normal.
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number = 20;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  desde?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  hasta?: string;

  @ApiPropertyOptional({ description: 'Uno o varios estados separados por coma' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  estado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fuente?: string;

  @ApiPropertyOptional({ enum: CATEGORIAS })
  @IsOptional()
  @IsIn(CATEGORIAS)
  categoria?: string;
}
