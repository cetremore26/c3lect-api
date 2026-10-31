import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PreciosService } from '../../application/precios.service';
import { CreatePrecioDto } from './dto/create-precio.dto';
import { UpdatePrecioDto } from './dto/update-precio.dto';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/infrastructure/http/auth/roles.guard';
import { Roles } from '../../../../shared/infrastructure/http/auth/roles.decorator';
import { CurrentUser } from '../../../../shared/infrastructure/http/auth/current-user.decorator';

@ApiTags('Precios')
@Controller('precios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class PreciosController {
  constructor(private readonly preciosService: PreciosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tabla de cálculo de precios (ADMIN)' })
  findAll() {
    return this.preciosService.findAll();
  }

  @Get('valores-por-defecto')
  @ApiOperation({
    summary: 'Valores por defecto para un precio nuevo (ADMIN)',
    description:
      'El panel prellena el formulario con esto en vez de tener la regla copiada.',
  })
  valoresPorDefecto() {
    return this.preciosService.valoresPorDefecto();
  }

  @Post()
  @ApiOperation({ summary: 'Agregar producto a tabla de precios (ADMIN)' })
  create(@Body() dto: CreatePrecioDto, @CurrentUser() user: { id: string }) {
    return this.preciosService.create(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar precios de un producto (ADMIN)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePrecioDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.preciosService.update(id, dto, user.id);
  }
}
