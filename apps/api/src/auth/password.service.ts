import { hash, verify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

// `Algorithm` is an ambient const enum, which cannot be referenced under isolatedModules.
// 2 is Argon2id; the library's defaults for the remaining parameters follow the OWASP guidance.
const ARGON2ID = 2 as Algorithm;
const OPTIONS = { algorithm: ARGON2ID };

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  /** Hash that unknown e-mails are verified against, so login time does not reveal whether an account exists. */
  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(16).toString('hex'));
  }

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  /** Always performs one full Argon2 verification, even when there is no stored hash. */
  async verify(storedHash: string | undefined, password: string): Promise<boolean> {
    const valid = await verify(storedHash ?? this.dummyHash, password).catch(() => false);
    return valid && storedHash !== undefined;
  }
}
