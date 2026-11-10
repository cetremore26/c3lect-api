import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MetodoPago } from '../../../domain/order-status';
import {
  MAX_ITEMS_POR_PEDIDO,
  METODOS_SIN_PASARELA,
} from '../../../domain/order-limits';
import type { CreateOrderCommand } from '../../../application/commands';
import { OrderItemDto } from './order-item.dto';
import { ShippingInfoDto } from './shipping-info.dto';

export class CreateOrderDto implements CreateOrderCommand {
  @ApiProperty({
    enum: METODOS_SIN_PASARELA,
    example: MetodoPago.TRANSFERENCIA,
  })
  @IsIn(METODOS_SIN_PASARELA)
  metodoPago: MetodoPago;

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

  // Cookies de Meta Pixel. Son opcionales a propósito: si el visitante trae
  // bloqueador de anuncios no existen, y eso no debe impedir el pedido.
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
