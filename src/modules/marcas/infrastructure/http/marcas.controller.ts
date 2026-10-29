import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarcasService } from '../../application/marcas.service';
import { JwtAuthGuard } from '../../../../shared/infrastructure/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/infrastructure/http/auth/roles.guard';
import { Roles } from '../../../../shared/infrastructure/http/auth/roles.decorator';

@ApiTags('Marcas')
@Controller('marcas')
export class MarcasController {
  constructor(private readonly marcasService: MarcasService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar marcas distintas ya registradas (ADMIN)' })
  findAll() {
    return this.marcasService.findAll();
  }
}
