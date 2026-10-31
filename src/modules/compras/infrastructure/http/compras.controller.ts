import { Body, Controller, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ComprasService } from '../../application/compras.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/infrastructure/http/auth/roles.guard';
import { Roles } from '../../../../shared/infrastructure/http/auth/roles.decorator';
import { CurrentUser } from '../../../../shared/infrastructure/http/auth/current-user.decorator';

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
