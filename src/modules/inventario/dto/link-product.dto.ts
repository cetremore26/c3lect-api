import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class LinkProductosDto {
  @ApiProperty({ type: [String], description: 'IDs de los productos (variantes) que consumen este pool de stock' })
  @IsArray()
  @IsString({ each: true })
  productIds: string[];
}
