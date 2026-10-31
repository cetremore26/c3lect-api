import { Global, Module } from '@nestjs/common';
import { EVENT_BUS } from './application/ports/event-bus.port';
import { UNIT_OF_WORK } from './application/ports/unit-of-work.port';
import { InProcessEventBus } from './infrastructure/events/in-process-event-bus';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { PrismaTransactionHost } from './infrastructure/prisma/prisma-transaction.host';

// Infraestructura transversal que todos los bounded contexts usan a través de
// puertos: base de datos, unidad de trabajo y bus de eventos. Reemplaza al
// antiguo PrismaModule.
@Global()
@Module({
  providers: [
    PrismaService,
    PrismaTransactionHost,
    InProcessEventBus,
    { provide: UNIT_OF_WORK, useExisting: PrismaTransactionHost },
    { provide: EVENT_BUS, useExisting: InProcessEventBus },
  ],
  exports: [PrismaService, PrismaTransactionHost, UNIT_OF_WORK, EVENT_BUS],
})
export class SharedKernelModule {}
