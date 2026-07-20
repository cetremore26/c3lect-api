import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CategoriaCompra } from './create-compra.dto';

export class UpdateCompraDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  marca?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  modelo?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  cantidad?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  costoUnitario?: number;

  @ApiPropertyOptional({ enum: CategoriaCompra })
  @IsOptional()
  @IsEnum(CategoriaCompra)
  categoria?: CategoriaCompra;
}
