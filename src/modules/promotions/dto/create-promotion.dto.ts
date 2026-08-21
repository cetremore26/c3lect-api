import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsIn,
  IsEnum,
  IsArray,
  IsDateString,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateIf,
  ArrayMinSize,
} from 'class-validator';
import { PromotionScope } from '@prisma/client';
import { CATEGORIAS } from '../../../common/categoria.util';

export class CreatePromotionDto {
  @ApiProperty({ example: 'Lanzamiento C3LECT — cuenta activa' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ enum: PromotionScope, example: PromotionScope.TODOS })
  @IsEnum(PromotionScope)
  alcance: PromotionScope;

  @ApiProperty({ example: 10, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  porcentaje: number;

  @ApiPropertyOptional({
    example: ['r-fossil-chicago'],
    type: [String],
    description: 'Requerido cuando alcance = PRODUCTO',
  })
  @ValidateIf(
    (dto: CreatePromotionDto) => dto.alcance === PromotionScope.PRODUCTO,
  )
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  productosIncluidos?: string[];

  @ApiPropertyOptional({
    enum: CATEGORIAS,
    description: 'Requerido cuando alcance = CATEGORIA',
  })
  @ValidateIf(
    (dto: CreatePromotionDto) => dto.alcance === PromotionScope.CATEGORIA,
  )
  @IsIn(CATEGORIAS)
  categoria?: string;

  @ApiPropertyOptional({
    example: 'Fossil',
    description: 'Requerido cuando alcance = MARCA',
  })
  @ValidateIf((dto: CreatePromotionDto) => dto.alcance === PromotionScope.MARCA)
  @IsString()
  @MaxLength(150)
  marca?: string;

  @ApiPropertyOptional({
    example: [],
    type: [String],
    description: 'Ids de producto excluidos siempre, sin importar el alcance',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excluidos?: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Si es true, el descuento solo aplica a compradores autenticados',
  })
  @IsOptional()
  @IsBoolean()
  soloCuentaActiva?: boolean;

  @ApiProperty({ example: '2026-08-20T00:00:00-05:00' })
  @IsDateString()
  fechaInicio: string;

  @ApiProperty({ example: '2026-09-20T23:59:59-05:00' })
  @IsDateString()
  fechaFin: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
