import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_ITEMS_POR_PEDIDO,
  OrderItemDto,
  ShippingInfoDto,
} from '../../../../orders/public-api';
import type { CreatePendingPaymentCommand } from '../../../application/use-cases/create-pending-order-payment.use-case';

export class CreatePendingPaymentDto implements CreatePendingPaymentCommand {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS_POR_PEDIDO)
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
  @MaxLength(255)
  fbp?: string;

  @ApiProperty({ required: false, description: 'Cookie _fbc de Meta Pixel' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fbc?: string;
}
