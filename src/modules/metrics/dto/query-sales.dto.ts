import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QuerySalesDto extends PaginationQueryDto {
  // Override del límite heredado (máx. 50): el dashboard usa este mismo
  // endpoint para traer de una vez todas las ventas pendientes/abonadas
  // (AdminDashboard.tsx pide limit=200), no solo para la tabla paginada.
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
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
}
