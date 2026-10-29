import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'Casa' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  alias?: string;

  @ApiProperty({ example: 'Medellín' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ciudad: string;

  @ApiProperty({ example: 'Antioquia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  departamento: string;

  @ApiProperty({ example: 'Calle 10 #20-30, Apt 5' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  direccion: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  esPrincipal?: boolean;
}
