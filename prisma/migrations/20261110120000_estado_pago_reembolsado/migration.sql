-- MercadoPago notifica reembolsos y contracargos (refunded / charged_back) como REEMBOLSADO.
ALTER TYPE "EstadoPago" ADD VALUE IF NOT EXISTS 'REEMBOLSADO';
