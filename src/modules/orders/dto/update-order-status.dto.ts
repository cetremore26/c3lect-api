import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EstadoPedido } from '@prisma/client';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: EstadoPedido, example: EstadoPedido.CONFIRMADO })
  @IsEnum(EstadoPedido)
  status: EstadoPedido;

  @ApiPropertyOptional({ example: 'Pago rechazado por el banco.' })
  @IsOptional()
  @IsString()
  notas?: string;
}
