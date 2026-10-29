import {
  Body,
  Controller,
  Delete,
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
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { ProductsService } from '../../application/products.service';
import {
  QueryProductDto,
  RangoPrecio,
  ProductSortBy,
  SortOrder,
} from './dto/query-product.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/infrastructure/http/auth/roles.guard';
import { Roles } from '../../../../shared/infrastructure/http/auth/roles.decorator';
import { CurrentUser } from '../../../../shared/infrastructure/http/auth/current-user.decorator';

@ApiTags('Productos')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos con filtros opcionales' })
  @ApiQuery({ name: 'categoria', required: false, example: 'reloj' })
  @ApiQuery({ name: 'marca', required: false, example: 'Fossil' })
  @ApiQuery({ name: 'genero', required: false, example: 'Hombre' })
  @ApiQuery({ name: 'rangoPrecio', required: false, enum: RangoPrecio })
  @ApiQuery({ name: 'soloDisponibles', required: false, type: Boolean })
  @ApiQuery({ name: 'destacado', required: false, type: Boolean })
  @ApiQuery({ name: 'sortBy', required: false, enum: ProductSortBy })
  @ApiQuery({ name: 'sortOrder', required: false, enum: SortOrder })
  @ApiOkResponse({ description: 'Lista de productos' })
  findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un producto por ID' })
  @ApiOkResponse({ description: 'Producto encontrado' })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear producto (requiere rol ADMIN)' })
  @ApiCreatedResponse({ description: 'Producto creado' })
  @ApiForbiddenResponse({ description: 'Se requiere rol ADMIN' })
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.productsService.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar producto (requiere rol ADMIN)' })
  @ApiOkResponse({ description: 'Producto actualizado' })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  @ApiForbiddenResponse({ description: 'Se requiere rol ADMIN' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.productsService.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar producto (requiere rol ADMIN)' })
  @ApiOkResponse({ description: 'Producto eliminado' })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  @ApiForbiddenResponse({ description: 'Se requiere rol ADMIN' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.productsService.remove(id, user.id);
  }
}
