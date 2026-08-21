-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('PRODUCTO', 'CATEGORIA', 'MARCA', 'TODOS');

-- CreateTable
CREATE TABLE "promociones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alcance" "PromotionScope" NOT NULL,
    "porcentaje" INTEGER NOT NULL,
    "productos_incluidos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoria" TEXT,
    "marca" TEXT,
    "excluidos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "solo_cuenta_activa" BOOLEAN NOT NULL DEFAULT false,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promociones_pkey" PRIMARY KEY ("id")
);

