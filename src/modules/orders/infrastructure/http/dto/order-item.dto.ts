import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_CANTIDAD_POR_ITEM } from '../../../domain/order-limits';

export class OrderItemDto {
  @ApiProperty({ example: 'prod-uuid-123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  productId: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: MAX_CANTIDAD_POR_ITEM })
  @IsInt()
  @Min(1)
  @Max(MAX_CANTIDAD_POR_ITEM)
  cantidad: number;
}
