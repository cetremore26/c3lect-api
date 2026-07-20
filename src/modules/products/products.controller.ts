import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags, ApiOperation, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiForbiddenResponse,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { QueryProductDto, RangoPrecio } from './dto/query-product.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('Productos')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos con filtros opcionales' })
  @ApiQuery({ name: 'categoria',       required: false, example: 'reloj' })
  @ApiQuery({ name: 'marca',           required: false, example: 'Fossil' })
  @ApiQuery({ name: 'genero',          required: false, example: 'Hombre' })
  @ApiQuery({ name: 'rangoPrecio',     required: false, enum: RangoPrecio })
  @ApiQuery({ name: 'soloDisponibles', required: false, type: Boolean })
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
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: { id: string; rol: string; nombre?: string },
  ) {
    const product = await this.productsService.create(dto);
    await this.auditService.log(
      'CREAR', 'producto', product.id,
      `Producto creado: ${product.display}`,
      user.id, user.nombre,
    );
    return product;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar producto (requiere rol ADMIN)' })
  @ApiOkResponse({ description: 'Producto actualizado' })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  @ApiForbiddenResponse({ description: 'Se requiere rol ADMIN' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: { id: string; rol: string; nombre?: string },
  ) {
    const product = await this.productsService.update(id, dto);
    await this.auditService.log(
      'EDITAR', 'producto', id,
      `Producto editado: ${product.display}`,
      user.id, user.nombre,
    );
    return product;
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
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; rol: string; nombre?: string },
  ) {
    const result = await this.productsService.remove(id);
    await this.auditService.log(
      'ELIMINAR', 'producto', id,
      `Producto eliminado: ${id}`,
      user.id, user.nombre,
    );
    return result;
  }
}
