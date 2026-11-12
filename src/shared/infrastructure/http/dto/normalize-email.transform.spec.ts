import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../../../../modules/auth/infrastructure/http/dto/login.dto';
import { RegisterDto } from '../../../../modules/auth/infrastructure/http/dto/register.dto';
import { RequestOtpDto } from '../../../../modules/auth/infrastructure/http/dto/request-otp.dto';
import { RequestPasswordResetDto } from '../../../../modules/auth/infrastructure/http/dto/request-password-reset.dto';
import { VerifyOtpDto } from '../../../../modules/auth/infrastructure/http/dto/verify-otp.dto';
import { ShippingInfoDto } from '../../../../modules/orders/infrastructure/http/dto/shipping-info.dto';

describe('NormalizeEmail', () => {
  it.each([
    [LoginDto, { email: ' Ana@Mail.COM ', password: 'x' }],
    [RequestOtpDto, { email: ' Ana@Mail.COM ' }],
    [VerifyOtpDto, { email: ' Ana@Mail.COM ', code: '123456' }],
    [RequestPasswordResetDto, { email: ' Ana@Mail.COM ' }],
    [
      ShippingInfoDto,
      {
        email: ' Ana@Mail.COM ',
        nombreCompleto: 'A',
        telefono: '1',
        ciudad: 'B',
        departamento: 'C',
        direccion: 'D',
      },
    ],
    [
      RegisterDto,
      { email: ' Ana@Mail.COM ', password: 'Password1!', nombre: 'A' },
    ],
  ])('%p normaliza y valida el email', async (Dto, plain) => {
    const dto = plainToInstance(Dto as new () => { email?: string }, plain);
    expect(dto.email).toBe('ana@mail.com');
    expect(await validate(dto)).toEqual([]);
  });

  it('RegisterDto sin email sigue siendo válido', async () => {
    const dto = plainToInstance(RegisterDto, {
      password: 'Password1!',
      nombre: 'A',
    });
    expect(dto.email).toBeUndefined();
    expect(await validate(dto)).toEqual([]);
  });
});
