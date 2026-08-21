import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
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
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('Promociones')
@Controller('promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly auditService: AuditService,
  ) {}

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
  async create(
    @Body() dto: CreatePromotionDto,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    const promo = await this.promotionsService.create(dto);
    await this.auditService.log(
      'CREAR',
      'promocion',
      promo.id,
      `Promoción creada: ${promo.nombre}`,
      user.id,
    );
    return promo;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar promoción (requiere rol ADMIN)' })
  @ApiOkResponse({ description: 'Promoción actualizada' })
  @ApiNotFoundResponse({ description: 'Promoción no encontrada' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    const promo = await this.promotionsService.update(id, dto);
    await this.auditService.log(
      'EDITAR',
      'promocion',
      id,
      `Promoción editada: ${promo.nombre}`,
      user.id,
    );
    return promo;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar promoción (requiere rol ADMIN)' })
  @ApiOkResponse({ description: 'Promoción eliminada' })
  @ApiNotFoundResponse({ description: 'Promoción no encontrada' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; rol: string },
  ) {
    const result = await this.promotionsService.remove(id);
    await this.auditService.log(
      'ELIMINAR',
      'promocion',
      id,
      `Promoción eliminada: ${id}`,
      user.id,
    );
    return result;
  }
}
