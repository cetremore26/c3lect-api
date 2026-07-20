import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateGastoDto {
  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  fecha: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  concepto: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  monto: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  responsable?: string;

  @ApiPropertyOptional({ enum: ['Pagado', 'Pendiente'] })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  estado?: string;
}
