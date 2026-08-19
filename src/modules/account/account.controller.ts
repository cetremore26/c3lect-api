import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccountService } from './account.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('Mi cuenta')
@Controller('account')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('profile')
  @ApiOperation({
    summary: 'Perfil del usuario autenticado (nombre, correo, teléfono)',
  })
  @ApiOkResponse({ description: 'Datos personales' })
  getProfile(@CurrentUser() user: { id: string }) {
    return this.accountService.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({
    summary: 'Actualizar nombre y/o teléfono del usuario autenticado',
  })
  @ApiOkResponse({ description: 'Perfil actualizado' })
  updateProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.accountService.updateProfile(user.id, dto);
  }

  @Get('addresses')
  @ApiOperation({
    summary: 'Listar direcciones guardadas del usuario autenticado',
  })
  @ApiOkResponse({ description: 'Direcciones — la principal siempre primero' })
  listAddresses(@CurrentUser() user: { id: string }) {
    return this.accountService.listAddresses(user.id);
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Agregar una dirección al usuario autenticado' })
  @ApiOkResponse({ description: 'Dirección creada' })
  createAddress(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAddressDto,
  ) {
    return this.accountService.createAddress(user.id, dto);
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Editar una dirección propia' })
  @ApiOkResponse({ description: 'Dirección actualizada' })
  updateAddress(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.accountService.updateAddress(user.id, id, dto);
  }

  @Post('addresses/:id/principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marcar una dirección propia como principal (desmarca las demás)',
  })
  @ApiOkResponse({ description: 'Dirección marcada como principal' })
  setPrincipal(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.accountService.setPrincipal(user.id, id);
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'Eliminar una dirección propia' })
  @ApiOkResponse({ description: 'Dirección eliminada' })
  deleteAddress(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.accountService.deleteAddress(user.id, id);
  }
}
