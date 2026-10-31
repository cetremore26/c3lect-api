import { Module } from '@nestjs/common';
import { ConversionTrackingService } from './application/conversion-tracking.service';
import { CONVERSIONS_API } from './application/ports/conversions-api.port';
import { ConversionTrackingSubscribers } from './infrastructure/events/conversion-tracking.subscribers';
import { MetaConversionsClient } from './infrastructure/meta-conversions.client';

// Contexto de medición de marketing: escucha compras y ventas y las reporta a
// Meta por Conversions API. Nadie lo importa; solo reacciona a eventos.
@Module({
  providers: [
    ConversionTrackingService,
    ConversionTrackingSubscribers,
    MetaConversionsClient,
    { provide: CONVERSIONS_API, useExisting: MetaConversionsClient },
  ],
})
export class MetaConversionsModule {}
