import { Body, Controller, Get, Inject, Logger, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Enforcer } from 'casbin';
import { FastifyRequest } from 'fastify';

import { PasswordIdentifierDTO } from '@app/base-system/lib/bounded-contexts/iam/authentication/application/dto/password-identifier.dto';
import { RefreshTokenDTO } from '@app/base-system/lib/bounded-contexts/iam/authentication/application/dto/refresh-token.dto';
import { AuthenticationService } from '@app/base-system/lib/bounded-contexts/iam/authentication/application/service/authentication.service';

import { CacheConstant } from '@lib/constants/cache.constant';
import { USER_AGENT } from '@lib/constants/rest.constant';
import { AUTHZ_ENFORCER, AuthZGuard } from '@lib/infra/casbin';
import { Public } from '@lib/infra/decorators/public.decorator';
import { ApiRes } from '@lib/infra/rest/res.response';
import { Ip2regionService } from '@lib/shared/ip2region/ip2region.service';
import { RedisUtility } from '@lib/shared/redis/redis.util';
import { IAuthentication } from '@lib/typings/global';
import { getClientIpAndPort } from '@lib/utils/ip.util';

import { PasswordLoginDto } from '../dto/password-login.dto';

@ApiTags('Authentication - Module')
@Controller('auth')
export class AuthenticationController {
  private readonly logger = new Logger(AuthenticationController.name);

  constructor(
    private readonly authenticationService: AuthenticationService,
    @Inject(AUTHZ_ENFORCER) private readonly enforcer: Enforcer,
  ) {}

  /** 解析客户端 IP、端口、归属地和请求 ID；归属地查询失败不影响登录，只记录调试日志 */
  private async clientContext(request: FastifyRequest) {
    const { ip, port } = getClientIpAndPort(request);
    let region = 'Unknown';
    try {
      const result = await Ip2regionService.getSearcher().search(ip);
      region = result.region || region;
    } catch (error) {
      this.logger.debug(`IP 归属地查询失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
    const requestId = (request as FastifyRequest & { id?: string }).id ?? 'unknown';
    return { ip, port, region, requestId };
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Password-based User Authentication',
    description:
      'Authenticates a user by verifying provided password credentials and issues a JSON Web Token (JWT) upon successful authentication.',
  })
  async login(
    @Body() dto: PasswordLoginDto,
    @Request() request: FastifyRequest,
  ): Promise<ApiRes<any>> {
    const { ip, port, region, requestId } = await this.clientContext(request);
    const token = await this.authenticationService.execPasswordLogin(
      new PasswordIdentifierDTO(
        dto.identifier,
        dto.password,
        ip,
        region,
        request.headers[USER_AGENT] ?? '',
        requestId,
        'PC',
        port,
      ),
    );
    return ApiRes.success(token);
  }

  @Public()
  @Post('refreshToken')
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @Request() request: FastifyRequest,
  ): Promise<ApiRes<any>> {
    const { ip, port, region, requestId } = await this.clientContext(request);
    const token = await this.authenticationService.refreshToken(
      new RefreshTokenDTO(
        refreshToken,
        ip,
        region,
        request.headers[USER_AGENT] ?? '',
        requestId,
        'PC',
        port,
      ),
    );
    return ApiRes.success(token);
  }

  @Get('getUserInfo')
  async getProfile(@Request() req: any): Promise<ApiRes<any>> {
    const user: IAuthentication = req.user;
    const userRoles =
      user.roles ??
      (await RedisUtility.instance.smembers(
        `${CacheConstant.AUTH_TOKEN_PREFIX}${user.uid}`,
      ));
    // 每个按钮都按接口使用的 Casbin 策略检查，不根据角色名直接赋权。
    // site:delete 未开放，不在可返回的权限列表中。
    const resources: Record<string, string[]> = {
      site: ['read', 'create', 'update'],
      strategy: ['read', 'create', 'update'],
      adjustment: ['read'],
      collector: ['read', 'create', 'update', 'delete'],
      account: ['read', 'update'],
      'account-binding': ['read', 'create', 'update', 'delete'],
      'system-setting': ['read', 'update'],
      telegram: ['read', 'create', 'update', 'delete', 'test', 'retry'],
      notification: ['read', 'update'],
      'fund-account': ['read', 'create', 'update'],
      settlement: ['read', 'create'],
      payee: ['read', 'create', 'update', 'delete'],
      'transfer-rule': ['read', 'create', 'update', 'delete'],
      'transfer-request': [
        'read',
        'cancel',
        'resolve',
        'test',
        'pause',
        'resume',
      ],
    };
    const permissions = Object.entries(resources).flatMap(
      ([resource, actions]) => actions.map((action) => ({ resource, action })),
    );
    const granted = await Promise.all(
      permissions.map(({ resource, action }) =>
        AuthZGuard.asyncSome<string>(userRoles, (role) =>
          this.enforcer.enforce(role, resource, action, user.domain),
        ),
      ),
    );
    return ApiRes.success({
      userId: user.uid,
      userName: user.username,
      roles: userRoles,
      buttons: permissions
        .filter((_, index) => granted[index])
        .map(({ resource, action }) => resource + ':' + action),
    });
  }
}
