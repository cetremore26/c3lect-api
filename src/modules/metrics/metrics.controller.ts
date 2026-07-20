import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { QuerySalesDto } from './dto/query-sales.dto';
import { QueryPurchasesDto } from './dto/query-purchases.dto';

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
  getSales(@Query() query: QuerySalesDto) {
    return this.metricsService.getSales(
      query.page,
      query.limit,
      query.desde,
      query.hasta,
      query.estado,
      query.fuente,
    );
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Compras históricas con filtros y paginación (ADMIN)' })
  getPurchases(@Query() query: QueryPurchasesDto) {
    return this.metricsService.getPurchases(
      query.page,
      query.limit,
      query.desde,
      query.hasta,
      query.categoria,
    );
  }
}
