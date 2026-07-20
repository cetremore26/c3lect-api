import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(150)
  email: string;
}
