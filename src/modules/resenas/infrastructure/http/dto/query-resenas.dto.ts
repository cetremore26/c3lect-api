import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../../shared/infrastructure/http/dto/pagination-query.dto';
import { EstadoResena } from '../../../domain/resena';
import type { ListarResenasQuery } from '../../../application/resenas.service';

export class QueryResenasDto
  extends PaginationQueryDto
  implements ListarResenasQuery
{
  @ApiPropertyOptional({ enum: EstadoResena })
  @IsOptional()
  @IsEnum(EstadoResena)
  estado?: EstadoResena;
}
