import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OrderItemDto, ShippingInfoDto } from '../../../../orders/public-api';
import type { CreatePendingPaymentCommand } from '../../../application/use-cases/create-pending-order-payment.use-case';

export class CreatePendingPaymentDto implements CreatePendingPaymentCommand {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ type: ShippingInfoDto })
  @ValidateNested()
  @Type(() => ShippingInfoDto)
  shippingInfo: ShippingInfoDto;

  // Se guardan con el pedido pendiente porque el evento de Conversions API
  // se manda mucho después, cuando MercadoPago confirma el pago por webhook.
  @ApiProperty({ required: false, description: 'Cookie _fbp de Meta Pixel' })
  @IsOptional()
  @IsString()
  fbp?: string;

  @ApiProperty({ required: false, description: 'Cookie _fbc de Meta Pixel' })
  @IsOptional()
  @IsString()
  fbc?: string;
}
