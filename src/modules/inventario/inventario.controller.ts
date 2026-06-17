import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventarioService } from './inventario.service';
import { LinkProductosDto } from './dto/link-product.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Inventario')
@Controller('inventario')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  @ApiOperation({ summary: 'Ver inventario maestro con stock y capital (ADMIN)' })
  findAll() {
    return this.inventarioService.findAll();
  }

  @Post('seed')
  @ApiOperation({ summary: 'Poblar inventario_maestro y calculo_precios desde purchases históricas (ADMIN)' })
  seed() {
    return this.inventarioService.seed();
  }

  @Patch(':id/link')
  @ApiOperation({ summary: 'Definir qué variantes de producto consumen este pool de stock (ADMIN)' })
  link(@Param('id') id: string, @Body() dto: LinkProductosDto) {
    return this.inventarioService.setProductos(id, dto.productIds);
  }
}
