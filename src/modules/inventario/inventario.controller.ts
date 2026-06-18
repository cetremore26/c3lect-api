import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventarioService } from './inventario.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Inventario')
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ver inventario maestro con stock y capital (ADMIN)' })
  findAll() {
    return this.inventarioService.findAll();
  }

  @Get('stock')
  @ApiOperation({ summary: 'Stock disponible por modelo (público) — usado para limitar cantidad en el carrito' })
  stockPublico() {
    return this.inventarioService.stockPublico();
  }

  @Post('seed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poblar inventario_maestro y calculo_precios desde purchases históricas (ADMIN)' })
  seed() {
    return this.inventarioService.seed();
  }
}
