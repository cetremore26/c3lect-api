-- Reseñas de productos.
--
-- Escribe solo la API (módulo resenas): un cliente reseña un producto que
-- recibió en un pedido ENTREGADO, una vez por producto. La tienda las lee
-- directo de Supabase, igual que el catálogo, para no depender de que Render
-- esté despierto; pero no lee la tabla: lee la vista `resenas_publicas`, que
-- solo expone las reseñas PUBLICADAS y nunca el user_id del autor.

-- CreateEnum
CREATE TYPE "EstadoResena" AS ENUM ('PUBLICADA', 'OCULTA');

-- CreateTable
CREATE TABLE "resenas" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "producto_nombre" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "autor_nombre" TEXT NOT NULL,
    "calificacion" INTEGER NOT NULL,
    "titulo" TEXT,
    "comentario" TEXT NOT NULL,
    "estado" "EstadoResena" NOT NULL DEFAULT 'PUBLICADA',
    "respuesta" TEXT,
    "respondida_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resenas_pkey" PRIMARY KEY ("id"),
    -- Segunda línea de defensa de la regla de dominio (1 a 5 estrellas).
    CONSTRAINT "resenas_calificacion_check" CHECK ("calificacion" BETWEEN 1 AND 5)
);

-- CreateIndex
CREATE UNIQUE INDEX "resenas_product_id_user_id_key" ON "resenas"("product_id", "user_id");

-- CreateIndex
CREATE INDEX "resenas_product_id_estado_idx" ON "resenas"("product_id", "estado");

-- AddForeignKey
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contrato público de reseñas: modelo de lectura, nunca escribe. Como
-- catalogo_publico, corre con los privilegios de su dueño para que anon lea
-- la vista sin tener acceso a la tabla.
CREATE VIEW "public"."resenas_publicas" WITH (security_invoker = false) AS
SELECT
  r.id,
  r.product_id,
  r.producto_nombre,
  r.autor_nombre,
  r.calificacion,
  r.titulo,
  r.comentario,
  r.respuesta,
  r.respondida_at,
  r.created_at
FROM "public"."resenas" r
WHERE r.estado = 'PUBLICADA';

COMMENT ON VIEW "public"."resenas_publicas" IS
  'Contrato público de reseñas para la tienda (Supabase anon). Ver migración 20261105000000.';

-- Supabase da por defecto todos los privilegios sobre tablas y vistas nuevas
-- de public a anon y authenticated: hay que quitárselos explícitamente. En la
-- vista importa doble: un SELECT simple sobre una tabla es una vista
-- actualizable en Postgres, y al correr con los permisos de su dueño un
-- INSERT/UPDATE/DELETE de anon a través de ella llegaría a la tabla. Por eso
-- se revoca todo y se concede solo SELECT.
-- Los roles solo existen en Supabase; en un Postgres local o de CI la
-- migración aplica igual.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "public"."resenas" FROM anon;
    REVOKE ALL ON "public"."resenas_publicas" FROM anon;
    GRANT SELECT ON "public"."resenas_publicas" TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "public"."resenas" FROM authenticated;
    REVOKE ALL ON "public"."resenas_publicas" FROM authenticated;
    GRANT SELECT ON "public"."resenas_publicas" TO authenticated;
  END IF;
END
$$;
