import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  VoucherGeneratorPort,
  VoucherOrder,
} from '../application/ports/voucher-generator.port';

// Removes diacritics so standard PDF fonts (WinAnsi) render all chars correctly
function pdfSafe(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function formatCOP(amount: number): string {
  return '$' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

@Injectable()
export class PdfVoucherGenerator implements VoucherGeneratorPort {
  async generate(order: VoucherOrder): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width } = page.getSize();
    const gold = rgb(0.83, 0.69, 0.22);
    const dark = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.4, 0.4, 0.4);
    const lightGray = rgb(0.85, 0.85, 0.85);

    let y = 782;

    // Header
    page.drawText('C3LECT', {
      x: 50,
      y,
      size: 32,
      font: boldFont,
      color: gold,
    });

    y -= 28;
    page.drawText('COMPROBANTE DE PAGO', {
      x: 50,
      y,
      size: 14,
      font: boldFont,
      color: dark,
    });

    y -= 18;
    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: lightGray,
    });

    // Order info
    y -= 28;
    page.drawText(pdfSafe(`Numero de orden: ${order.orderNumber}`), {
      x: 50,
      y,
      size: 11,
      font: boldFont,
      color: dark,
    });

    y -= 20;
    const fecha = new Date().toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    page.drawText(pdfSafe(`Fecha de pago: ${fecha}`), {
      x: 50,
      y,
      size: 11,
      font,
      color: gray,
    });

    // Products table header
    y -= 38;
    page.drawRectangle({
      x: 50,
      y: y - 6,
      width: width - 100,
      height: 22,
      color: rgb(0.95, 0.95, 0.95),
    });
    page.drawText('Producto', {
      x: 56,
      y,
      size: 10,
      font: boldFont,
      color: dark,
    });
    page.drawText('Cant.', {
      x: 355,
      y,
      size: 10,
      font: boldFont,
      color: dark,
    });
    page.drawText('Precio', {
      x: 400,
      y,
      size: 10,
      font: boldFont,
      color: dark,
    });
    page.drawText('Subtotal', {
      x: 460,
      y,
      size: 10,
      font: boldFont,
      color: dark,
    });

    for (const item of order.items) {
      y -= 22;
      const nombre = pdfSafe(
        item.nombre.length > 42
          ? item.nombre.substring(0, 39) + '...'
          : item.nombre,
      );
      page.drawText(nombre, { x: 56, y, size: 9, font, color: dark });
      page.drawText(String(item.cantidad), {
        x: 365,
        y,
        size: 9,
        font,
        color: dark,
      });
      page.drawText(formatCOP(item.precioUnitario), {
        x: 395,
        y,
        size: 9,
        font,
        color: dark,
      });
      page.drawText(formatCOP(item.subtotal), {
        x: 455,
        y,
        size: 9,
        font,
        color: dark,
      });
    }

    y -= 14;
    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 0.5,
      color: lightGray,
    });

    // Total
    y -= 22;
    page.drawText('TOTAL:', {
      x: 400,
      y,
      size: 13,
      font: boldFont,
      color: dark,
    });
    page.drawText(`${formatCOP(order.total)} COP`, {
      x: 455,
      y,
      size: 13,
      font: boldFont,
      color: gold,
    });

    // Footer
    y -= 70;
    page.drawText(pdfSafe('Gracias por tu compra en C3LECT'), {
      x: width / 2 - 105,
      y,
      size: 12,
      font: boldFont,
      color: gray,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
