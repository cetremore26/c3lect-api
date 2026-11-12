import { NormalizeEmail } from '../../../../../shared/infrastructure/http/dto/normalize-email.transform';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(150)
  email: string;
}
