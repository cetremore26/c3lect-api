import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateVentaDto {
  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  fecha: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  cliente: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  celular?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  marca: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  modelo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
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
  @MaxLength(50)
  fuente?: string;

  @ApiProperty({ enum: ['Pagado', 'Abonado', 'Pendiente', 'Uso Personal'] })
  @IsString()
  @MaxLength(50)
  estado: string;
}
