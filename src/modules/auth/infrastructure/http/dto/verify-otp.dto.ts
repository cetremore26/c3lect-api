import { NormalizeEmail } from '../../../../../shared/infrastructure/http/dto/normalize-email.transform';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: '483921' })
  @IsString()
  @Length(6, 6)
  code: string;
}
