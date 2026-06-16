import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateGastoDto {
  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  fecha: string;

  @ApiProperty()
  @IsString()
  concepto: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  monto: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsable?: string;

  @ApiPropertyOptional({ enum: ['Pagado', 'Pendiente'] })
  @IsOptional()
  @IsString()
  estado?: string;
}
