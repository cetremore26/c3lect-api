// src/modules/meta-conversions/meta-conversions.module.ts
// Módulo estándar de NestJS. Créalo tal cual.

import { Module } from '@nestjs/common';
import { MetaConversionsService } from './meta-conversions.service';

@Module({
  providers: [MetaConversionsService],
  exports: [MetaConversionsService],
})
export class MetaConversionsModule {}
