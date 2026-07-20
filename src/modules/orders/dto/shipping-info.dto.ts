import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ShippingInfoDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombreCompleto: string;

  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: '+573001234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefono: string;

  @ApiProperty({ example: 'Bogotá' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ciudad: string;

  @ApiProperty({ example: 'Cundinamarca' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  departamento: string;

  @ApiProperty({ example: 'Calle 123 #45-67, Apt 8' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  direccion: string;

  @ApiPropertyOptional({ example: 'Tocar timbre 2 veces' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}
