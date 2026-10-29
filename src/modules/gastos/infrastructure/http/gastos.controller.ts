import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GastosService } from '../../application/gastos.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/infrastructure/http/auth/roles.guard';
import { Roles } from '../../../../shared/infrastructure/http/auth/roles.decorator';
import { CurrentUser } from '../../../../shared/infrastructure/http/auth/current-user.decorator';

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
  create(@Body() dto: CreateGastoDto, @CurrentUser() user: { id: string }) {
    return this.gastosService.create(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editar gasto (ADMIN)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGastoDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.gastosService.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar gasto (ADMIN)' })
  remove(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.gastosService.remove(id, user.id);
  }
}
