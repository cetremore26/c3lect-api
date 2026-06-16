import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateVentaDto {
  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  fecha: string;

  @ApiProperty()
  @IsString()
  cliente: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  celular?: string;

  @ApiProperty()
  @IsString()
  modelo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  estilo?: string;

  @ApiProperty({ description: '0 para Uso Personal' })
  @IsInt()
  @Min(0)
  precioVenta: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  costoProducto: number;

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  costoEnvio: number;

  @ApiProperty({ description: 'Abono o pago recibido' })
  @IsInt()
  @Min(0)
  abono: number;

  @ApiPropertyOptional({ enum: ['WhatsApp', 'Presencial', 'Referido', 'Instagram'] })
  @IsOptional()
  @IsString()
  fuente?: string;

  @ApiProperty({ enum: ['Pagado', 'Abonado', 'Pendiente', 'Uso Personal'] })
  @IsString()
  estado: string;
}
