import { UnauthorizedError } from '../../../shared/domain/domain-error';
import { fakeEventBus, fakeUnitOfWork } from '../../../shared/testing/fakes';
import { CodigoDeAccesoSolicitado } from '../domain/identity-events';
import { AuthService } from './auth.service';

const usuario = {
  id: 'u-1',
  email: 'a@x.com',
  nombre: 'Ana',
  rol: 'CLIENTE',
  passwordHash: null,
};

function makeService() {
  const identity = {
    findUserByEmail: jest.fn(),
    saveRefreshToken: jest.fn(),
    countOtpsSince: jest.fn(),
    invalidateOtps: jest.fn(),
    saveOtp: jest.fn(),
    findLiveOtp: jest.fn(),
    reserveOtpAttempt: jest.fn(),
    consumeOtp: jest.fn(),
  };
  const hasher = {
    hash: jest.fn((p: string) => Promise.resolve('H:' + p)),
    verify: jest.fn((h: string, p: string) => Promise.resolve(h === 'H:' + p)),
  };
  const tokens = { issue: jest.fn(() => 'access') };
  const settings = { refreshTokenTtl: jest.fn(() => '7d') };
  const events = fakeEventBus();
  const service = new AuthService(
    identity as never,
    hasher,
    tokens,
    settings as never,
    fakeUnitOfWork(),
    events as never,
  );
  return { service, identity, hasher, tokens, events };
}

describe('requestOtp', () => {
  it('emite y publica un código cuando hay cupo', async () => {
    const { service, identity, events } = makeService();
    identity.countOtpsSince.mockResolvedValue(2);
    await service.requestOtp({ email: 'a@x.com' });
    expect(identity.invalidateOtps).toHaveBeenCalledWith('a@x.com', 'LOGIN');
    expect(identity.saveOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@x.com', proposito: 'LOGIN' }),
    );
    expect(events.of(CodigoDeAccesoSolicitado)[0].solicitud.codigo).toMatch(
      /^\d{6}$/,
    );
  });

  it('con 3 códigos en 15 min responde lo mismo y no emite', async () => {
    const { service, identity, events } = makeService();
    identity.countOtpsSince.mockResolvedValue(3);
    await expect(service.requestOtp({ email: 'a@x.com' })).resolves.toEqual({
      message: 'Si el correo está registrado, recibirás un código.',
    });
    expect(identity.saveOtp).not.toHaveBeenCalled();
    expect(events.published).toHaveLength(0);
  });
});

describe('verifyOtp', () => {
  const vivo = { id: 'otp-1', hash: 'H:123456', intentos: 0 };

  it('compara solo contra el código vivo y lo consume', async () => {
    const { service, identity, hasher } = makeService();
    identity.findLiveOtp.mockResolvedValue(vivo);
    identity.reserveOtpAttempt.mockResolvedValue(true);
    identity.consumeOtp.mockResolvedValue(true);
    identity.findUserByEmail.mockResolvedValue(null);
    await service.verifyOtp({ email: 'a@x.com', code: '123456' });
    expect(hasher.verify).toHaveBeenCalledTimes(1);
    expect(identity.consumeOtp).toHaveBeenCalledWith('otp-1');
  });

  it('reserva el intento antes de comparar el código', async () => {
    const { service, identity, hasher } = makeService();
    const orden: string[] = [];
    identity.findLiveOtp.mockResolvedValue(vivo);
    identity.reserveOtpAttempt.mockImplementation(() => {
      orden.push('reserve');
      return Promise.resolve(true);
    });
    hasher.verify.mockImplementation(() => {
      orden.push('verify');
      return Promise.resolve(true);
    });
    identity.consumeOtp.mockResolvedValue(true);
    identity.findUserByEmail.mockResolvedValue(null);
    await service.verifyOtp({ email: 'a@x.com', code: '123456' });
    expect(identity.reserveOtpAttempt).toHaveBeenCalledWith('otp-1', 5);
    expect(orden).toEqual(['reserve', 'verify']);
  });

  it('código incorrecto responde 401 y no consume', async () => {
    const { service, identity } = makeService();
    identity.findLiveOtp.mockResolvedValue(vivo);
    identity.reserveOtpAttempt.mockResolvedValue(true);
    await expect(
      service.verifyOtp({ email: 'a@x.com', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(identity.consumeOtp).not.toHaveBeenCalled();
  });

  it('si no queda intento por reservar → 401 sin comparar', async () => {
    const { service, identity, hasher } = makeService();
    identity.findLiveOtp.mockResolvedValue(vivo);
    identity.reserveOtpAttempt.mockResolvedValue(false);
    await expect(
      service.verifyOtp({ email: 'a@x.com', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('sin código vivo (p. ej. uno anterior ya invalidado) → 401', async () => {
    const { service, identity } = makeService();
    identity.findLiveOtp.mockResolvedValue(null);
    await expect(
      service.verifyOtp({ email: 'a@x.com', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(identity.reserveOtpAttempt).not.toHaveBeenCalled();
  });

  it('si consumeOtp pierde la carrera → 401 y no emite tokens', async () => {
    const { service, identity, tokens } = makeService();
    identity.findLiveOtp.mockResolvedValue(vivo);
    identity.reserveOtpAttempt.mockResolvedValue(true);
    identity.consumeOtp.mockResolvedValue(false);
    await expect(
      service.verifyOtp({ email: 'a@x.com', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('con cuenta existente devuelve tokens y usuario', async () => {
    const { service, identity } = makeService();
    identity.findLiveOtp.mockResolvedValue(vivo);
    identity.reserveOtpAttempt.mockResolvedValue(true);
    identity.consumeOtp.mockResolvedValue(true);
    identity.findUserByEmail.mockResolvedValue(usuario);
    const r = await service.verifyOtp({ email: 'a@x.com', code: '123456' });
    expect(r).toEqual(
      expect.objectContaining({
        accessToken: 'access',
        user: expect.objectContaining({ id: 'u-1' }),
      }),
    );
  });
});
