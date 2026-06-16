import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GastosService } from './gastos.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Gastos')
@Controller('gastos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los gastos (ADMIN)' })
  findAll() {
    return this.gastosService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Registrar nuevo gasto (ADMIN)' })
  create(@Body() dto: CreateGastoDto) {
    return this.gastosService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editar gasto (ADMIN)' })
  update(@Param('id') id: string, @Body() dto: UpdateGastoDto) {
    return this.gastosService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar gasto (ADMIN)' })
  remove(@Param('id') id: string) {
    return this.gastosService.remove(id);
  }
}
