-- Cookies de Meta Pixel capturadas en el checkout.
--
-- Se guardan junto al pedido porque en la rama de MercadoPago el evento de
-- Conversions API se envía cuando llega el webhook — minutos u horas después
-- del checkout — y para entonces ya no hay navegador del cliente que consultar.
-- Sin meta_fbc, Meta no puede atribuir la venta al clic del anuncio.
--
-- Ambas son NULL-ables a propósito: si el visitante trae bloqueador de
-- anuncios las cookies no existen, y eso no debe impedir que compre.

ALTER TABLE "orders" ADD COLUMN "meta_fbp" TEXT;
ALTER TABLE "orders" ADD COLUMN "meta_fbc" TEXT;
