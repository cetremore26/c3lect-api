import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryAuditDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['CREAR', 'EDITAR', 'ELIMINAR', 'ESTADO'] })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accion?: string;

  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  fechaHasta?: string;
}
