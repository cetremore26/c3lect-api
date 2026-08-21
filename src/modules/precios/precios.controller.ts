import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PreciosService } from './precios.service';
import { CreatePrecioDto } from './dto/create-precio.dto';
import { UpdatePrecioDto } from './dto/update-precio.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Precios')
@Controller('precios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class PreciosController {
  constructor(private readonly preciosService: PreciosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tabla de cálculo de precios (ADMIN)' })
  findAll() {
    return this.preciosService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Agregar producto a tabla de precios (ADMIN)' })
  create(@Body() dto: CreatePrecioDto, @CurrentUser() user: { id: string }) {
    return this.preciosService.create(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar precios de un producto (ADMIN)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePrecioDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.preciosService.update(id, dto, user.id);
  }
}
