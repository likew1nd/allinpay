import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ISecurityConfig, SecurityConfig } from '@lib/config';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { IAuthentication } from '@lib/typings/global';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(SecurityConfig.KEY)
    securityConfig: ISecurityConfig,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: securityConfig.jwtSecret,
    });
  }

  async validate(payload: any) {
    await this.validateAuthenticationPayload(payload);
    const user = await this.prisma.sysUser.findUnique({
      where: { id: payload.uid },
    });
    if (!user || user.status !== 'ENABLED' || user.domain !== payload.domain) {
      throw new UnauthorizedException('User is unavailable');
    }
    const assignments = await this.prisma.sysUserRole.findMany({
      where: { userId: user.id },
    });
    const roles = await this.prisma.sysRole.findMany({
      where: {
        id: { in: assignments.map((item) => item.roleId) },
        status: 'ENABLED',
      },
      select: { code: true },
    });
    return {
      ...payload,
      username: user.username,
      roles: roles.map((role) => role.code),
    };
  }

  assertIsIAuthentication(payload: any): asserts payload is IAuthentication {
    if (typeof payload.uid !== 'string') {
      throw new UnauthorizedException('Invalid UID');
    }
    if (typeof payload.username !== 'string') {
      throw new UnauthorizedException('Invalid username');
    }
    if (typeof payload.domain !== 'string') {
      throw new UnauthorizedException('Invalid domain');
    }
  }

  async validateAuthenticationPayload(payload: any): Promise<IAuthentication> {
    this.assertIsIAuthentication(payload);
    return payload;
  }
}
