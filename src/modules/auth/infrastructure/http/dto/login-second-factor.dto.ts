import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class LoginSecondFactorDto {
  @ApiProperty({ description: 'Token devuelto por POST /auth/login' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  challengeToken: string;

  @ApiProperty({ example: '483921' })
  @IsString()
  @Length(6, 6)
  code: string;
}
