import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 'uuid-del-pedido', description: 'ID del pedido a pagar' })
  @IsUUID()
  orderId: string;
}
