-- El admin ocultó el producto a mano: reponer stock no debe re-publicarlo.
-- Las filas existentes quedan en false (no se puede saber cuáles se ocultaron a mano).
ALTER TABLE "productos" ADD COLUMN "oculto_por_admin" BOOLEAN NOT NULL DEFAULT false;
