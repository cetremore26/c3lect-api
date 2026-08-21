import { Body, Controller, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ComprasService } from './compras.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Compras')
@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar nueva compra de inventario (ADMIN)' })
  create(@Body() dto: CreateCompraDto, @CurrentUser() user: { id: string }) {
    return this.comprasService.create(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Actualizar compra — recalcula costoTotal y ajusta inventario (ADMIN)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompraDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.comprasService.update(id, dto, user.id);
  }
}
