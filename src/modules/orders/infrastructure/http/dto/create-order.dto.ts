import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { MetodoPago } from '../../../domain/order-status';
import type { CreateOrderCommand } from '../../../application/commands';
import { OrderItemDto } from './order-item.dto';
import { ShippingInfoDto } from './shipping-info.dto';

export class CreateOrderDto implements CreateOrderCommand {
  @ApiProperty({ enum: MetodoPago, example: MetodoPago.TRANSFERENCIA })
  @IsEnum(MetodoPago)
  metodoPago: MetodoPago;

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

  // Cookies de Meta Pixel. Son opcionales a propósito: si el visitante trae
  // bloqueador de anuncios no existen, y eso no debe impedir el pedido.
  @ApiProperty({ required: false, description: 'Cookie _fbp de Meta Pixel' })
  @IsOptional()
  @IsString()
  fbp?: string;

  @ApiProperty({ required: false, description: 'Cookie _fbc de Meta Pixel' })
  @IsOptional()
  @IsString()
  fbc?: string;
}
