import { Body, Controller, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Ventas')
@Controller('ventas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar nueva venta histórica (ADMIN)' })
  create(@Body() dto: CreateVentaDto) {
    return this.ventasService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar venta — recalcula saldo, ganancia y auto-cierra si abono >= precio (ADMIN)' })
  update(@Param('id') id: string, @Body() dto: UpdateVentaDto) {
    return this.ventasService.update(id, dto);
  }
}
