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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { PromotionsService } from '../../application/promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/infrastructure/http/auth/roles.guard';
import { Roles } from '../../../../shared/infrastructure/http/auth/roles.decorator';
import { CurrentUser } from '../../../../shared/infrastructure/http/auth/current-user.decorator';

@ApiTags('Promociones')
@Controller('promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar todas las promociones (requiere rol ADMIN)',
  })
  @ApiOkResponse({ description: 'Lista de promociones' })
  @ApiForbiddenResponse({ description: 'Se requiere rol ADMIN' })
  findAll() {
    return this.promotionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener una promoción por ID (requiere rol ADMIN)',
  })
  @ApiOkResponse({ description: 'Promoción encontrada' })
  @ApiNotFoundResponse({ description: 'Promoción no encontrada' })
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear promoción (requiere rol ADMIN)' })
  @ApiCreatedResponse({ description: 'Promoción creada' })
  create(
    @Body() dto: CreatePromotionDto,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.promotionsService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar promoción (requiere rol ADMIN)' })
  @ApiOkResponse({ description: 'Promoción actualizada' })
  @ApiNotFoundResponse({ description: 'Promoción no encontrada' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.promotionsService.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar promoción (requiere rol ADMIN)' })
  @ApiOkResponse({ description: 'Promoción eliminada' })
  @ApiNotFoundResponse({ description: 'Promoción no encontrada' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    return this.promotionsService.remove(id, user.id);
  }
}
