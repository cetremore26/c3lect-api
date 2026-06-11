import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { MetodoPago } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({ example: 'uuid-del-pedido', description: 'ID del pedido a pagar' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ enum: MetodoPago, example: MetodoPago.TARJETA_CREDITO })
  @IsEnum(MetodoPago)
  metodoPago: MetodoPago;
}
