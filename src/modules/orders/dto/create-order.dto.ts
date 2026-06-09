import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { MetodoPago } from '@prisma/client';
import { OrderItemDto } from './order-item.dto';
import { ShippingInfoDto } from './shipping-info.dto';

export class CreateOrderDto {
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
}
