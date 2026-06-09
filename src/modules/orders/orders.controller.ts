import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Pedidos')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear pedido',
    description:
      'Público — funciona para invitados (sin JWT) y usuarios autenticados (con JWT). Si hay JWT, el pedido se vincula a la cuenta.',
  })
  @ApiCreatedResponse({ description: 'Pedido creado — retorna pedido completo con items y shipping info' })
  createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user?: { id: string; rol: string },
  ) {
    return this.ordersService.createOrder(dto, user?.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar pedidos',
    description: 'Admin ve todos los pedidos con filtros. Cliente ve solo los suyos.',
  })
  @ApiOkResponse({ description: 'Lista paginada de pedidos' })
  findAll(
    @Query() query: QueryOrdersDto,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.ordersService.findAll(query, user.id, user.rol);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle de un pedido — admin ve cualquiera, cliente solo los suyos' })
  @ApiOkResponse({ description: 'Pedido completo con items, shipping info e historial de estados' })
  @ApiNotFoundResponse({ description: 'Pedido no encontrado' })
  @ApiForbiddenResponse({ description: 'No tienes permiso para ver este pedido' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.ordersService.findOne(id, user.id, user.rol);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar estado del pedido (admin) — notifica al cliente por correo' })
  @ApiOkResponse({ description: 'Estado actualizado y notificación enviada' })
  @ApiNotFoundResponse({ description: 'Pedido no encontrado' })
  @ApiForbiddenResponse({ description: 'Se requiere rol ADMIN' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.ordersService.updateStatus(id, dto, user.id);
  }
}
