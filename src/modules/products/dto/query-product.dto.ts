import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum RangoPrecio {
  BAJO  = '0-150',
  MEDIO = '150-300',
  ALTO  = '300+',
}

export class QueryProductDto {
  @ApiPropertyOptional({ example: 'reloj' })
  @IsOptional()
  @IsString()
  categoria?: string;

  @ApiPropertyOptional({ example: 'Fossil' })
  @IsOptional()
  @IsString()
  marca?: string;

  @ApiPropertyOptional({ example: 'Hombre' })
  @IsOptional()
  @IsString()
  genero?: string;

  @ApiPropertyOptional({ enum: RangoPrecio, example: RangoPrecio.MEDIO })
  @IsOptional()
  @IsEnum(RangoPrecio)
  rangoPrecio?: RangoPrecio;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  soloDisponibles?: boolean;
}
