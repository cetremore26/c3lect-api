import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import { PrismaIdentityRepository } from './prisma-identity.repository';

// Test de integración contra una base local. Sin la variable, se omite.
// NUNCA apuntarla a producción.
//   INTEGRATION_DATABASE_URL=postgresql://... pnpm test:int
const url = process.env.INTEGRATION_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const enUnRato = () => new Date(Date.now() + 10 * 60 * 1000);

describeDb('PrismaIdentityRepository (OTP)', () => {
  let prisma: PrismaService;
  let repo: PrismaIdentityRepository;
  let email: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new PrismaIdentityRepository(new PrismaTransactionHost(prisma));
  });

  beforeEach(() => {
    email = `otp-${randomUUID()}@test.local`;
  });

  afterEach(async () => {
    await prisma.otpCode.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('consumeOtp concurrente: solo una llamada gana', async () => {
    await repo.saveOtp({
      email,
      proposito: 'LOGIN',
      codeHash: 'h',
      expiresAt: enUnRato(),
    });
    const { id } = (await repo.findLiveOtp(email, 'LOGIN'))!;
    const r = await Promise.all([
      repo.consumeOtp(id),
      repo.consumeOtp(id),
      repo.consumeOtp(id),
    ]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await repo.findLiveOtp(email, 'LOGIN')).toBeNull();
  });

  it('reserveOtpAttempt: el quinto intento aún puede acertar y consumir', async () => {
    await repo.saveOtp({
      email,
      proposito: 'LOGIN',
      codeHash: 'h',
      expiresAt: enUnRato(),
    });
    const { id } = (await repo.findLiveOtp(email, 'LOGIN'))!;
    for (let i = 0; i < 4; i++) {
      expect(await repo.reserveOtpAttempt(id, 5)).toBe(true);
    }
    expect(await repo.reserveOtpAttempt(id, 5)).toBe(true);
    expect(await repo.consumeOtp(id)).toBe(true);
    expect(await repo.findLiveOtp(email, 'LOGIN')).toBeNull();
  });

  it('reserveOtpAttempt concurrente: 8 llamadas, exactamente 5 ganan', async () => {
    await repo.saveOtp({
      email,
      proposito: 'LOGIN',
      codeHash: 'h',
      expiresAt: enUnRato(),
    });
    const { id } = (await repo.findLiveOtp(email, 'LOGIN'))!;
    const r = await Promise.all(
      Array.from({ length: 8 }, () => repo.reserveOtpAttempt(id, 5)),
    );
    expect(r.filter(Boolean)).toHaveLength(5);
    expect(await repo.reserveOtpAttempt(id, 5)).toBe(false);
  });

  it('invalidateOtps solo afecta al propósito indicado', async () => {
    for (const proposito of ['LOGIN', 'ADMIN_2FA'] as const) {
      await repo.saveOtp({
        email,
        proposito,
        codeHash: 'h',
        expiresAt: enUnRato(),
      });
    }
    await repo.invalidateOtps(email, 'LOGIN');
    expect(await repo.findLiveOtp(email, 'LOGIN')).toBeNull();
    expect(await repo.findLiveOtp(email, 'ADMIN_2FA')).not.toBeNull();
  });

  it('countOtpsSince cuenta filas emitidas desde la fecha, usadas o no', async () => {
    for (let i = 0; i < 2; i++) {
      await repo.saveOtp({
        email,
        proposito: 'LOGIN',
        codeHash: 'h',
        expiresAt: enUnRato(),
      });
    }
    await repo.invalidateOtps(email, 'LOGIN');
    await repo.saveOtp({
      email,
      proposito: 'ADMIN_2FA',
      codeHash: 'h',
      expiresAt: enUnRato(),
    });
    const hace1Min = new Date(Date.now() - 60 * 1000);
    expect(await repo.countOtpsSince(email, 'LOGIN', hace1Min)).toBe(2);
    expect(
      await repo.countOtpsSince(email, 'LOGIN', new Date(Date.now() + 1000)),
    ).toBe(0);
  });
});

describeDb('PrismaIdentityRepository (reset de contraseña)', () => {
  let prisma: PrismaService;
  let repo: PrismaIdentityRepository;
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new PrismaIdentityRepository(new PrismaTransactionHost(prisma));
    const user = await prisma.user.create({
      data: {
        email: `reset-${randomUUID()}@test.local`,
        nombre: 'Reset',
        passwordHash: 'h',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('consumePasswordReset concurrente: solo una llamada gana', async () => {
    const { id } = await repo.savePasswordReset(userId, 'h', enUnRato());
    const r = await Promise.all([
      repo.consumePasswordReset(id),
      repo.consumePasswordReset(id),
      repo.consumePasswordReset(id),
    ]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await repo.findValidPasswordReset(id)).toBeNull();
  });

  it('invalidatePasswordResetsOf deja findValidPasswordReset en null', async () => {
    const { id } = await repo.savePasswordReset(userId, 'h', enUnRato());
    expect(await repo.findValidPasswordReset(id)).toEqual({
      id,
      userId,
      hash: 'h',
    });
    await repo.invalidatePasswordResetsOf(userId);
    expect(await repo.findValidPasswordReset(id)).toBeNull();
  });
});

describeDb('PrismaIdentityRepository (refresh tokens)', () => {
  let prisma: PrismaService;
  let repo: PrismaIdentityRepository;
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new PrismaIdentityRepository(new PrismaTransactionHost(prisma));
    const user = await prisma.user.create({
      data: {
        email: `refresh-${randomUUID()}@test.local`,
        nombre: 'Refresh',
        passwordHash: 'h',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('consumeRefreshToken concurrente: solo una llamada gana', async () => {
    const tokenHash = `h-${randomUUID()}`;
    await repo.saveRefreshToken(userId, tokenHash, enUnRato());
    const record = await repo.findValidRefreshToken(tokenHash);
    expect(record).not.toBeNull();
    const id = record!.id;
    const r = await Promise.all([
      repo.consumeRefreshToken(id),
      repo.consumeRefreshToken(id),
      repo.consumeRefreshToken(id),
    ]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await repo.findValidRefreshToken(tokenHash)).toBeNull();
  });
});
