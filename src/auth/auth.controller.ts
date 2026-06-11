import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registro con email y contraseña' })
  @ApiCreatedResponse({ description: 'Usuario creado — retorna accessToken y refreshToken' })
  @ApiConflictResponse({ description: 'El correo ya está registrado' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con email y contraseña' })
  @ApiOkResponse({ description: 'Retorna accessToken y refreshToken' })
  @ApiUnauthorizedResponse({ description: 'Credenciales incorrectas' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar código OTP por correo' })
  @ApiOkResponse({ description: 'Respuesta siempre igual para no revelar si el correo existe' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar código OTP' })
  @ApiOkResponse({ description: 'Retorna tokens si el usuario existe, o requiresRegistration: true si no' })
  @ApiUnauthorizedResponse({ description: 'Código inválido o expirado' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar enlace de recuperación de contraseña' })
  @ApiOkResponse({ description: 'Respuesta siempre igual para no revelar si el correo existe' })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar contraseña con token de recuperación' })
  @ApiOkResponse({ description: 'Contraseña actualizada — invalida todas las sesiones activas' })
  @ApiUnauthorizedResponse({ description: 'Token inválido o expirado' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar par de tokens usando el refresh token' })
  @ApiOkResponse({ description: 'Nuevo accessToken y refreshToken' })
  @ApiUnauthorizedResponse({ description: 'Refresh token inválido o expirado' })
  refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiOkResponse({ description: 'Perfil del usuario' })
  @ApiUnauthorizedResponse({ description: 'Token inválido o expirado' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  me(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión — invalida todos los refresh tokens del usuario' })
  @ApiOkResponse({ description: 'Sesión cerrada' })
  logout(@CurrentUser() user: { id: string }) {
    return this.authService.logout(user.id);
  }
}
