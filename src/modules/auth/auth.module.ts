import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './application/auth.service';
import {
  ACCESS_TOKEN_ISSUER,
  AUTH_SETTINGS,
  PASSWORD_HASHER,
  PURPOSE_TOKENS,
} from './application/ports/auth-services.port';
import { IDENTITY_REPOSITORY } from './application/ports/identity-repository.port';
import {
  Argon2PasswordHasher,
  ConfigAuthSettings,
  JwtAccessTokenIssuer,
  JwtPurposeTokens,
} from './infrastructure/adapters/auth-services.adapters';
import { ROLE_READER } from '../../shared/application/ports/role-reader.port';
import { PrismaRoleReader } from './infrastructure/adapters/prisma-role-reader';
import { AuthController } from './infrastructure/http/auth.controller';
import { JwtStrategy } from './infrastructure/http/jwt.strategy';
import { PrismaIdentityRepository } from './infrastructure/persistence/prisma-identity.repository';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // jsonwebtoken tipa expiresIn como StringValue (literal tipo "15m", "7d", ...) | number,
          // demasiado estricto para un valor que viene de una env var en runtime.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: IDENTITY_REPOSITORY, useClass: PrismaIdentityRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKEN_ISSUER, useClass: JwtAccessTokenIssuer },
    { provide: AUTH_SETTINGS, useClass: ConfigAuthSettings },
    { provide: PURPOSE_TOKENS, useClass: JwtPurposeTokens },
    { provide: ROLE_READER, useClass: PrismaRoleReader },
  ],
  exports: [ROLE_READER],
})
export class AuthModule {}
