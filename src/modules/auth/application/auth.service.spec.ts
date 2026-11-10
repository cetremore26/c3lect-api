import {
  BusinessRuleViolation,
  UnauthorizedError,
} from '../../../shared/domain/domain-error';
import { fakeEventBus, fakeUnitOfWork } from '../../../shared/testing/fakes';
import {
  CodigoDeAccesoSolicitado,
  UsuarioRegistrado,
} from '../domain/identity-events';
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
    findUserById: jest.fn(),
    saveRefreshToken: jest.fn(),
    createUser: jest.fn(),
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
  const purposeTokens = {
    firmar: jest.fn(() => 'tok'),
    verificar: jest.fn(),
  };
  const service = new AuthService(
    identity as never,
    hasher,
    tokens,
    settings as never,
    fakeUnitOfWork(),
    events as never,
    purposeTokens,
  );
  return { service, identity, hasher, tokens, events, purposeTokens };
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

describe('verifyOtp sin cuenta', () => {
  it('devuelve registrationToken de 15 min', async () => {
    const { service, identity, purposeTokens } = makeService();
    identity.findLiveOtp.mockResolvedValue({
      id: 'otp-1',
      hash: 'H:123456',
      intentos: 0,
    });
    identity.reserveOtpAttempt.mockResolvedValue(true);
    identity.consumeOtp.mockResolvedValue(true);
    identity.findUserByEmail.mockResolvedValue(null);
    const r = await service.verifyOtp({ email: 'a@x.com', code: '123456' });
    expect(r).toEqual({ requiresRegistration: true, registrationToken: 'tok' });
    expect(purposeTokens.firmar).toHaveBeenCalledWith(
      'registro',
      { email: 'a@x.com' },
      900,
    );
  });
});

describe('register', () => {
  const base = { password: 'Password1!', nombre: 'Ana' };

  function listo() {
    const ctx = makeService();
    ctx.identity.findUserByEmail.mockResolvedValue(null);
    ctx.identity.createUser.mockResolvedValue(usuario);
    ctx.purposeTokens.verificar.mockReturnValue({ email: 'a@x.com' });
    return ctx;
  }

  it('sin token → 401', async () => {
    const { service } = listo();
    await expect(service.register({ ...base })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('con token inválido → 401', async () => {
    const { service, purposeTokens } = listo();
    purposeTokens.verificar.mockReturnValue(null);
    await expect(
      service.register({ ...base, registrationToken: 'mal' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('usa el email del token', async () => {
    const { service, identity, purposeTokens } = listo();
    await service.register({ ...base, registrationToken: 'tok' });
    expect(purposeTokens.verificar).toHaveBeenCalledWith('registro', 'tok');
    expect(identity.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@x.com' }),
    );
  });

  it('con otro email en el body → 400', async () => {
    const { service, identity } = listo();
    await expect(
      service.register({
        ...base,
        registrationToken: 'tok',
        email: 'otro@x.com',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleViolation);
    expect(identity.createUser).not.toHaveBeenCalled();
  });

  it('publica UsuarioRegistrado (vincula pedidos)', async () => {
    const { service, events } = listo();
    await service.register({ ...base, registrationToken: 'tok' });
    expect(events.of(UsuarioRegistrado)).toHaveLength(1);
  });
});

describe('login', () => {
  it('con usuario inexistente ejecuta igual un argon2 y responde 401', async () => {
    const { service, identity, hasher } = makeService();
    identity.findUserByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: 'no@x.com', password: 'p' }),
    ).rejects.toThrow(UnauthorizedError);
    expect(hasher.verify).toHaveBeenCalledTimes(1);
  });
});

describe('segundo factor del admin', () => {
  const admin = {
    id: 'admin-1',
    email: 'admin@x.com',
    nombre: 'Root',
    rol: 'ADMIN',
    passwordHash: 'H:clave',
  };
  const vivo = { id: 'otp-9', hash: 'H:123456', intentos: 0 };

  function otpOk(identity: ReturnType<typeof makeService>['identity']) {
    identity.findLiveOtp.mockResolvedValue(vivo);
    identity.reserveOtpAttempt.mockResolvedValue(true);
    identity.consumeOtp.mockResolvedValue(true);
  }

  it('login de ADMIN no devuelve tokens: emite OTP ADMIN_2FA y un challengeToken', async () => {
    const { service, identity, tokens, purposeTokens } = makeService();
    identity.findUserByEmail.mockResolvedValue(admin);
    identity.countOtpsSince.mockResolvedValue(0);
    purposeTokens.firmar.mockReturnValue('chal');
    const r = await service.login({ email: 'admin@x.com', password: 'clave' });
    expect(r).toEqual({ requiresSecondFactor: true, challengeToken: 'chal' });
    expect(identity.saveOtp).toHaveBeenCalledWith(
      expect.objectContaining({ proposito: 'ADMIN_2FA' }),
    );
    expect(purposeTokens.firmar).toHaveBeenCalledWith(
      'admin-2fa',
      { sub: 'admin-1' },
      600,
    );
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('login de ADMIN con emisión agotada devuelve igual el challengeToken', async () => {
    const { service, identity, purposeTokens } = makeService();
    identity.findUserByEmail.mockResolvedValue(admin);
    identity.countOtpsSince.mockResolvedValue(3);
    purposeTokens.firmar.mockReturnValue('chal');
    const r = await service.login({ email: 'admin@x.com', password: 'clave' });
    expect(r).toEqual({ requiresSecondFactor: true, challengeToken: 'chal' });
    expect(identity.saveOtp).not.toHaveBeenCalled();
  });

  it('login de CLIENTE sigue devolviendo tokens', async () => {
    const { service, identity } = makeService();
    identity.findUserByEmail.mockResolvedValue({
      ...usuario,
      passwordHash: 'H:clave',
    });
    const r = await service.login({ email: 'a@x.com', password: 'clave' });
    expect(r).toEqual(expect.objectContaining({ accessToken: 'access' }));
  });

  it('loginSecondFactor con código correcto devuelve la sesión', async () => {
    const { service, identity, purposeTokens } = makeService();
    purposeTokens.verificar.mockReturnValue({ sub: 'admin-1' });
    identity.findUserById.mockResolvedValue(admin);
    otpOk(identity);
    const r = await service.loginSecondFactor({
      challengeToken: 'chal',
      code: '123456',
    });
    expect(purposeTokens.verificar).toHaveBeenCalledWith('admin-2fa', 'chal');
    expect(identity.findLiveOtp).toHaveBeenCalledWith(
      'admin@x.com',
      'ADMIN_2FA',
    );
    expect(r).toEqual(
      expect.objectContaining({
        accessToken: 'access',
        user: expect.objectContaining({ id: 'admin-1' }),
      }),
    );
  });

  it('loginSecondFactor busca solo códigos ADMIN_2FA (un LOGIN no sirve)', async () => {
    const { service, identity, purposeTokens } = makeService();
    purposeTokens.verificar.mockReturnValue({ sub: 'admin-1' });
    identity.findUserById.mockResolvedValue(admin);
    identity.findLiveOtp.mockImplementation((_e: string, p: string) =>
      Promise.resolve(p === 'LOGIN' ? vivo : null),
    );
    await expect(
      service.loginSecondFactor({ challengeToken: 'chal', code: '123456' }),
    ).rejects.toThrow('Código inválido o expirado.');
    expect(identity.findLiveOtp).toHaveBeenCalledWith(
      'admin@x.com',
      'ADMIN_2FA',
    );
  });

  it('loginSecondFactor con challengeToken inválido → 401', async () => {
    const { service, purposeTokens } = makeService();
    purposeTokens.verificar.mockReturnValue(null);
    await expect(
      service.loginSecondFactor({ challengeToken: 'x', code: '123456' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('loginSecondFactor si el usuario ya no es ADMIN → 401', async () => {
    const { service, identity, purposeTokens } = makeService();
    purposeTokens.verificar.mockReturnValue({ sub: 'u-1' });
    identity.findUserById.mockResolvedValue(usuario);
    await expect(
      service.loginSecondFactor({ challengeToken: 'chal', code: '123456' }),
    ).rejects.toThrow('Código inválido o expirado.');
  });

  it('verifyOtp de un ADMIN responde el 401 genérico', async () => {
    const { service, identity, tokens } = makeService();
    otpOk(identity);
    identity.findUserByEmail.mockResolvedValue(admin);
    await expect(
      service.verifyOtp({ email: 'admin@x.com', code: '123456' }),
    ).rejects.toThrow('Código inválido o expirado.');
    expect(identity.consumeOtp).toHaveBeenCalled();
    expect(tokens.issue).not.toHaveBeenCalled();
  });
});
