import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResenasService } from '../../application/resenas.service';
import { CrearResenaDto } from './dto/crear-resena.dto';
import { CambiarEstadoResenaDto } from './dto/cambiar-estado-resena.dto';
import { ResponderResenaDto } from './dto/responder-resena.dto';
import { QueryResenasDto } from './dto/query-resenas.dto';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/infrastructure/http/auth/roles.guard';
import { Roles } from '../../../../shared/infrastructure/http/auth/roles.decorator';
import { CurrentUser } from '../../../../shared/infrastructure/http/auth/current-user.decorator';

// La lectura pública no está aquí: la tienda lee la vista `resenas_publicas`.
@ApiTags('Reseñas')
@Controller('resenas')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ResenasController {
  constructor(private readonly resenasService: ResenasService) {}

  @Get('pendientes')
  @ApiOperation({
    summary: 'Productos que el cliente recibió y aún no ha reseñado',
  })
  pendientes(@CurrentUser() user: { id: string }) {
    return this.resenasService.pendientes(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Reseñar un producto recibido' })
  crear(@CurrentUser() user: { id: string }, @Body() dto: CrearResenaDto) {
    return this.resenasService.crear(user.id, dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar todas las reseñas (ADMIN)' })
  listar(@Query() query: QueryResenasDto) {
    return this.resenasService.listar(query);
  }

  @Patch(':id/estado')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Publicar u ocultar una reseña (ADMIN)' })
  cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoResenaDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.resenasService.cambiarEstado(id, dto.estado, user.id);
  }

  @Put(':id/respuesta')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Responder como tienda, o retirar la respuesta (ADMIN)',
  })
  responder(
    @Param('id') id: string,
    @Body() dto: ResponderResenaDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.resenasService.responder(id, dto.respuesta, user.id);
  }
}
