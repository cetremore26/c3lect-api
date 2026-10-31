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
import { CreateOrderUseCase } from '../../application/use-cases/create-order.use-case';
import { GetOrderUseCase } from '../../application/use-cases/get-order.use-case';
import { ListOrdersUseCase } from '../../application/use-cases/list-orders.use-case';
import { UpdateOrderStatusUseCase } from '../../application/use-cases/update-order-status.use-case';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../../shared/infrastructure/http/auth/optional-jwt-auth.guard';
import { RolesGuard } from '../../../../shared/infrastructure/http/auth/roles.guard';
import { Roles } from '../../../../shared/infrastructure/http/auth/roles.decorator';
import { CurrentUser } from '../../../../shared/infrastructure/http/auth/current-user.decorator';

@ApiTags('Pedidos')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
    private readonly updateOrderStatusUseCase: UpdateOrderStatusUseCase,
  ) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear pedido',
    description:
      'Público — funciona para invitados (sin JWT) y usuarios autenticados (con JWT). Si hay JWT, el pedido se vincula a la cuenta.',
  })
  @ApiCreatedResponse({
    description:
      'Pedido creado — retorna pedido completo con items y shipping info',
  })
  createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user?: { id: string; rol: string },
  ) {
    return this.createOrderUseCase.execute(dto, user?.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar pedidos',
    description:
      'Admin ve todos los pedidos con filtros. Cliente ve solo los suyos.',
  })
  @ApiOkResponse({ description: 'Lista paginada de pedidos' })
  findAll(
    @Query() query: QueryOrdersDto,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.listOrdersUseCase.execute(query, {
      userId: user.id,
      rol: user.rol,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Detalle de un pedido — admin ve cualquiera, cliente solo los suyos',
  })
  @ApiOkResponse({
    description:
      'Pedido completo con items, shipping info e historial de estados',
  })
  @ApiNotFoundResponse({ description: 'Pedido no encontrado' })
  @ApiForbiddenResponse({
    description: 'No tienes permiso para ver este pedido',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.getOrderUseCase.execute(id, { userId: user.id, rol: user.rol });
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Cambiar estado del pedido (admin) — notifica al cliente por correo',
  })
  @ApiOkResponse({ description: 'Estado actualizado y notificación enviada' })
  @ApiNotFoundResponse({ description: 'Pedido no encontrado' })
  @ApiForbiddenResponse({ description: 'Se requiere rol ADMIN' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.updateOrderStatusUseCase.execute(id, dto.status, user.id);
  }
}
