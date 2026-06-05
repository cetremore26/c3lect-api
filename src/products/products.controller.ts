import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { QueryProductDto, RangoPrecio } from './dto/query-product.dto';

@ApiTags('Productos')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos con filtros opcionales' })
  @ApiQuery({ name: 'categoria',      required: false, example: 'reloj' })
  @ApiQuery({ name: 'marca',          required: false, example: 'Fossil' })
  @ApiQuery({ name: 'genero',         required: false, example: 'MUJER' })
  @ApiQuery({ name: 'rangoPrecio',    required: false, enum: RangoPrecio })
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
}
