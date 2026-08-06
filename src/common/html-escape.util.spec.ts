import { escapeHtml } from './html-escape.util';

describe('escapeHtml', () => {
  it('escapa los cinco caracteres especiales de HTML', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('neutraliza un intento de inyeccion de HTML en un nombre de cliente', () => {
    const input = '<img src=x onerror=alert(1)>';
    expect(escapeHtml(input)).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapa el & antes que las entidades que introduce, sin doble-escapar', () => {
    expect(escapeHtml('Tom & Jerry <3')).toBe('Tom &amp; Jerry &lt;3');
  });

  it('deja intacto el texto sin caracteres especiales', () => {
    expect(escapeHtml('Juan Perez')).toBe('Juan Perez');
  });

  it('devuelve string vacio para input vacio', () => {
    expect(escapeHtml('')).toBe('');
  });
});
