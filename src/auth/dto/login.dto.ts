import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: 'Password1!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
