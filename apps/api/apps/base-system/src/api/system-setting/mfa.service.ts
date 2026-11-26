import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ulid } from 'ulid';

import { PrismaService } from '@lib/shared/prisma/prisma.service';

import { decryptSiteSecret, encryptSiteSecret } from '../site/site-credentials';

import {
  MFA_ENABLED_KEY,
  SystemSettingService,
} from './system-setting.service';
import { base32Encode, otpauthUri, verifyTotp } from './totp';

const ISSUER = 'Epay Operations';
const CODE_ERROR = '验证码错误或已使用，请等待下一个验证码';

type TotpRow = {
  userId: string;
  secretEncrypted: string;
  verified: boolean;
  lastUsedStep: number | null;
};

// MFA：总开关在系统设置里，默认关闭。
// 开启后，确认转账、开启自动转账均需验证码。
// 开启和关闭总开关本身都要验证码，开启前必须已绑定验证器。
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingService,
  ) {}

  async status(userId: string) {
    const [enabled, row] = await Promise.all([
      this.settings.getBoolean(MFA_ENABLED_KEY),
      this.prisma.userTotp.findUnique({ where: { userId } }),
    ]);
    return { enabled, bound: !!row?.verified, pending: !!row && !row.verified };
  }

  // 明文密钥仅在本次生成时返回，已绑定的验证器不能直接覆盖。
  async beginBinding(userId: string, label: string) {
    const existing = await this.prisma.userTotp.findUnique({
      where: { userId },
    });
    if (existing?.verified) throw new ConflictException('已绑定验证器，不能重复绑定');
    const secret = base32Encode(randomBytes(20));
    const secretEncrypted = encryptSiteSecret(userId, 'totp-secret', secret);
    await this.prisma.userTotp.upsert({
      where: { userId },
      create: { id: `totp-${ulid().toLowerCase()}`, userId, secretEncrypted },
      update: {
        secretEncrypted,
        verified: false,
        lastUsedStep: null,
        verifiedAt: null,
      },
    });
    return { secret, otpauthUri: otpauthUri(secret, label, ISSUER) };
  }

  async confirmBinding(userId: string, code: string | undefined) {
    const row = await this.prisma.userTotp.findUnique({ where: { userId } });
    if (!row) throw new ConflictException('请先生成验证器密钥');
    if (row.verified) throw new ConflictException('验证器已绑定');
    await this.consume(row, code, true);
    return { bound: true };
  }

  async verifyCode(userId: string, code: string | undefined) {
    const row = await this.prisma.userTotp.findUnique({ where: { userId } });
    if (!row?.verified) throw new ConflictException('请先在系统设置里绑定验证器');
    await this.consume(row, code, false);
  }

  // 业务动作统一检查总开关，启用 MFA 后验证当前用户的验证码。
  async requireIfEnabled(userId: string, code: string | undefined) {
    if (!(await this.settings.getBoolean(MFA_ENABLED_KEY))) return;
    await this.verifyCode(userId, code);
  }

  async setEnabled(userId: string, enabled: boolean, code: string | undefined) {
    const current = await this.settings.getBoolean(MFA_ENABLED_KEY);
    if (current === enabled) return { enabled };
    await this.verifyCode(userId, code);
    await this.settings.setBoolean(MFA_ENABLED_KEY, enabled, userId);
    return { enabled };
  }

  private async consume(
    row: TotpRow,
    code: string | undefined,
    confirming: boolean,
  ) {
    if (!code || !/^\d{6}$/.test(code))
      throw new BadRequestException('请输入 6 位验证码');
    const secret = decryptSiteSecret(
      row.userId,
      'totp-secret',
      row.secretEncrypted,
    );
    const step = verifyTotp(secret, code, Date.now(), row.lastUsedStep);
    if (step === null) throw new BadRequestException(CODE_ERROR);
    // 原子消耗时间步，防止并发请求重复使用同一验证码。
    const result = await this.prisma.userTotp.updateMany({
      where: {
        userId: row.userId,
        verified: !confirming,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
      },
      data: {
        lastUsedStep: step,
        ...(confirming ? { verified: true, verifiedAt: new Date() } : {}),
      },
    });
    if (!result.count) throw new BadRequestException(CODE_ERROR);
  }
}
