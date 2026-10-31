import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type {
  AccessTokenIssuerPort,
  AuthSettingsPort,
  PasswordHasherPort,
} from '../../application/ports/auth-services.port';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}

@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuerPort {
  constructor(private readonly jwt: JwtService) {}

  issue(payload: { sub: string; email: string; rol: string }): string {
    return this.jwt.sign(payload);
  }
}

@Injectable()
export class ConfigAuthSettings implements AuthSettingsPort {
  constructor(private readonly config: ConfigService) {}

  frontendUrl(): string | undefined {
    return this.config.get<string>('FRONTEND_URL');
  }

  refreshTokenTtl(): string {
    return this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
  }
}
