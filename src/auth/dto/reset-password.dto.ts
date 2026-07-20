import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const PASSWORD_MSG = 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial.';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  token: string;

  @ApiProperty({ example: 'NewPassword1!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  newPassword: string;
}
