import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Métricas')
@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen del dashboard admin con datos históricos (ADMIN)' })
  getSummary() {
    return this.metricsService.getSummary();
  }

  @Get('financial')
  @ApiOperation({ summary: 'Resumen financiero completo — equivalente al RESUMEN INVERSIÓN del Excel (ADMIN)' })
  getFinancial() {
    return this.metricsService.getFinancial();
  }

  @Get('sales')
  @ApiOperation({ summary: 'Ventas históricas con filtros y paginación (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'desde', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'estado', required: false, type: String })
  @ApiQuery({ name: 'fuente', required: false, type: String })
  getSales(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('estado') estado?: string,
    @Query('fuente') fuente?: string,
  ) {
    return this.metricsService.getSales(
      Number(page),
      Number(limit),
      desde,
      hasta,
      estado,
      fuente,
    );
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Compras históricas con filtros y paginación (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'desde', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'categoria', required: false, type: String })
  getPurchases(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('categoria') categoria?: string,
  ) {
    return this.metricsService.getPurchases(
      Number(page),
      Number(limit),
      desde,
      hasta,
      categoria,
    );
  }
}
