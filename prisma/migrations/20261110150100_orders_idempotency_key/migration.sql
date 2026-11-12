-- Clave que genera el checkout al montarse: un reintento (doble clic, red
-- caída) devuelve el pedido ya creado en vez de duplicarlo.
ALTER TABLE "orders" ADD COLUMN "idempotency_key" UUID;
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");
