import { BusinessRuleViolation } from '../../../shared/domain/domain-error';
import { nombrePublico, normalizarRespuesta, validarContenido } from './resena';

describe('validarContenido', () => {
  const valido = { calificacion: 5, comentario: 'Llegó perfecto y a tiempo.' };

  it.each([0, 6, 3.5, NaN])('rechaza la calificación %p', (calificacion) => {
    expect(() => validarContenido({ ...valido, calificacion })).toThrow(
      BusinessRuleViolation,
    );
  });

  it('rechaza un comentario demasiado corto aunque tenga espacios de relleno', () => {
    expect(() =>
      validarContenido({ ...valido, comentario: '   bien      ' }),
    ).toThrow(BusinessRuleViolation);
  });

  it('rechaza un comentario de más de 1000 caracteres', () => {
    expect(() =>
      validarContenido({ ...valido, comentario: 'a'.repeat(1001) }),
    ).toThrow(BusinessRuleViolation);
  });

  it('rechaza un título de más de 80 caracteres', () => {
    expect(() =>
      validarContenido({ ...valido, titulo: 'a'.repeat(81) }),
    ).toThrow(BusinessRuleViolation);
  });

  it('recorta el texto y colapsa las líneas en blanco repetidas', () => {
    expect(
      validarContenido({
        calificacion: 4,
        titulo: '  Muy   buen reloj ',
        comentario: '  Primer párrafo.\r\n\r\n\r\n\r\nSegundo párrafo.  ',
      }),
    ).toEqual({
      calificacion: 4,
      titulo: 'Muy buen reloj',
      comentario: 'Primer párrafo.\n\nSegundo párrafo.',
    });
  });

  it('un título vacío queda en null', () => {
    expect(validarContenido({ ...valido, titulo: '   ' }).titulo).toBeNull();
  });
});

describe('normalizarRespuesta', () => {
  it('una respuesta vacía significa quitarla', () => {
    expect(normalizarRespuesta('   ')).toBeNull();
  });

  it('recorta la respuesta', () => {
    expect(normalizarRespuesta('  ¡Gracias!  ')).toBe('¡Gracias!');
  });

  it('rechaza una respuesta de más de 1000 caracteres', () => {
    expect(() => normalizarRespuesta('a'.repeat(1001))).toThrow(
      BusinessRuleViolation,
    );
  });
});

describe('nombrePublico', () => {
  it.each([
    ['juan pérez gómez', 'Juan P.'],
    ['MARÍA FERNANDA', 'María F.'],
    ['  Camila  ', 'Camila'],
    ['', 'Cliente C3LECT'],
    [null, 'Cliente C3LECT'],
  ])('%p → %p', (entrada, esperado) => {
    expect(nombrePublico(entrada)).toBe(esperado);
  });
});
