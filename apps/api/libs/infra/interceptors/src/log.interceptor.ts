import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { OperationLogProperties } from '@app/base-system/lib/bounded-contexts/log-audit/operation-log/domain/operation-log.read.model';

import { EVENT_OPERATION_LOG_CREATED } from '@lib/constants/event-emitter-token.constant';
import { USER_AGENT } from '@lib/constants/rest.constant';
import {
  LOG_KEY,
  OperationLogContext,
} from '@lib/infra/decorators/log.decorator';
import { IAuthentication } from '@lib/typings/global';

const AUDIT_RECORDED = Symbol.for('epay.audit.recorded');
const SENSITIVE_KEY_PARTS = [
  'password',
  'token',
  'secret',
  'revision',
  'authorization',
  'cookie',
  'dbhost',
  'dbname',
  'dbuser',
  'credentialref',
  'bankaccount',
  'bankcardno',
  'accountnumber',
  'accountno',
  'cardnumber',
  'cardno',
  'payeeaccount',
  'payeraccount',
  'recipientaccount',
  'cvv',
  'cvc',
];
const MODULE_LABELS: Record<string, string> = {
  sites: '站点管理',
  'strategy-groups': '策略中心',
  'strategy-templates': '策略中心',
  'strategy-workspace': '策略中心',
  strategies: '策略中心',
  payees: '收款管理',
  'transfer-rules': '转账管理',
  'transfer-requests': '转账管理',
  mfa: '系统设置',
  collectors: '账号采集',
  'fund-accounts': '资金管理',
  'payment-requests': '付款管理',
  settlements: '结算管理',
  'account-bindings': '账号管理',
  user: '用户权限',
  role: '用户权限',
  route: '菜单权限',
  domain: '用户权限',
  authorization: '用户权限',
  'api-endpoint': '接口管理',
  'access-key': '接口密钥',
  'operation-log': '系统日志',
  'login-log': '登录审计',
};
export function operationRouteSegments(url: string) {
  const segments = url.split('/').filter(Boolean);
  return /^v\d+$/.test(segments[0] ?? '') ? segments.slice(1) : segments;
}
const API_OPERATION_LABELS: Record<string, string> = {
  'Create a New AccessKey': '新增接口密钥',
  'Delete a AccessKey': '删除接口密钥',
  'Create a New Domain': '新增权限域',
  'Update a Domain': '修改权限域',
  'Delete a Domain': '删除权限域',
  'Create a New Route': '新增菜单路由',
  'Update a Route': '修改菜单路由',
  'Delete a Route': '删除菜单路由',
  'Create a New Role': '新增角色',
  'Update a Role': '修改角色',
  'Delete a Role': '删除角色',
  'Create a New User': '新增用户',
  'Update a User': '修改用户',
  'Delete a User': '删除用户',
};
export function operationDescription(description?: string) {
  return description
    ? (API_OPERATION_LABELS[description] ?? description)
    : undefined;
}
export function responseObjectName(response: unknown) {
  let payload = response;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      break;
    const record = payload as Record<string, unknown>;
    if ('audit' in record && record.audit && typeof record.audit === 'object') {
      const auditName = (record.audit as Record<string, unknown>).objectName;
      if (typeof auditName === 'string' && auditName) return auditName;
    }
    if (typeof record.name === 'string' && record.name) return record.name;
    if (record.data && typeof record.data === 'object') payload = record.data;
    else break;
  }
  return undefined;
}
export function requestOperationDescription(
  description: string,
  route: string[],
  body: unknown,
) {
  const values =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (route[0] === 'sites' && route.at(-1) === 'automation')
    return values.paused === true ? '暂停站点自动调整' : '恢复站点自动调整';
  if (route.includes('channels') && route.at(-1) === 'status')
    return Number(values.status) === 1 ? '启用站点通道' : '停用站点通道';
  return description;
}
export function safeConfigurationSummary(value: unknown) {
  const body =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const changes =
    body.changes &&
    typeof body.changes === 'object' &&
    !Array.isArray(body.changes)
      ? (body.changes as Record<string, unknown>)
      : {};
  return {
    configuredFields: Object.keys(changes),
    appTypesChanged: Array.isArray(body.apptype),
    note: '仅记录变更项名称，配置值已隐藏',
  };
}
export function safeValue(value: any, depth = 0): any {
  if (depth > 8) return '[内容已省略]';
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => safeValue(item, depth + 1));
  if (!value || typeof value !== 'object')
    return typeof value === 'string' && value.length > 4000
      ? value.slice(0, 4000) + '…'
      : value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sensitive =
        normalizedKey === 'account' ||
        normalizedKey === 'code' ||
        normalizedKey === 'pin' ||
        normalizedKey.endsWith('key') ||
        /^(mfa|totp|auth|verify|verification|otp).*?(code|otp)$/.test(
          normalizedKey,
        ) ||
        SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part));
      return [key, sensitive ? '[已脱敏]' : safeValue(item, depth + 1)];
    }),
  );
}
@Injectable()
export class LogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<
      FastifyRequest & {
        user?: IAuthentication;
        operationLogContext?: OperationLogContext;
        [AUDIT_RECORDED]?: boolean;
      }
    >();
    const method = request.method;
    const logMetadata = this.reflector.get(LOG_KEY, context.getHandler());
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const user = request.user;

    if (
      request[AUDIT_RECORDED] ||
      (!logMetadata && (!isMutation || !user?.uid)) ||
      !user?.uid
    )
      return next.handle();

    request[AUDIT_RECORDED] = true;
    const url = request.routeOptions?.url ?? request.url.split('?')[0];
    const route = operationRouteSegments(url);
    const moduleName =
      logMetadata?.moduleName ?? MODULE_LABELS[route[0]] ?? '系统操作';
    const routeParams = request.params as Record<string, unknown> | undefined;
    const action =
      method === 'POST'
        ? routeParams && Object.keys(routeParams).length > 0
          ? '执行'
          : '新增'
        : method === 'DELETE'
          ? '删除'
          : '修改';
    const apiOperation = this.reflector.get<{ summary?: string }>(
      'swagger/apiOperation',
      context.getHandler(),
    );
    const description =
      request.operationLogContext?.description ??
      requestOperationDescription(
        logMetadata?.description ??
          operationDescription(apiOperation?.summary) ??
          action + moduleName,
        route,
        request.body,
      );
    const startTime = new Date();
    const channelConfiguration =
      /\/sites\/[^/]+\/channels\/[^/]+\/configuration(?:\?|$)/.test(
        request.url,
      );
    const params = channelConfiguration ? '[已脱敏]' : safeValue(request.query);
    const defaultBody = channelConfiguration
      ? safeConfigurationSummary(request.body)
      : logMetadata?.logBody === false
        ? null
        : safeValue(request.body);
    const objectId =
      routeParams?.code ?? routeParams?.id ?? routeParams?.siteId ?? null;
    const requestObjectName =
      (request.body as Record<string, unknown> | undefined)?.name ??
      routeParams?.code ??
      objectId ??
      route[0];
    const requestId =
      (request as FastifyRequest & { id?: string }).id ?? 'unknown';

    const record = (statusCode: number, response?: unknown) => {
      const endTime = new Date();
      const operationContext = request.operationLogContext;
      const resolvedObjectName =
        operationContext?.objectName ??
        responseObjectName(response) ??
        requestObjectName;
      const entry: OperationLogProperties = {
        userId: user.uid,
        username: user.username || user.uid,
        domain: user.domain || 'built-in',
        moduleName,
        description: operationContext?.description ?? description,
        requestId,
        method,
        url,
        ip: request.ip,
        userAgent: request.headers[USER_AGENT] ?? null,
        params,
        body:
          operationContext?.body !== undefined
            ? safeValue(operationContext.body)
            : defaultBody,
        response:
          statusCode >= 400 || logMetadata?.logResponse
            ? safeValue(response)
            : null,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        source: 'USER',
        level:
          statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
        status: statusCode >= 400 ? 'FAILED' : 'SUCCEEDED',
        objectId:
          (operationContext?.objectId ?? objectId) === null
            ? null
            : String(operationContext?.objectId ?? objectId),
        objectName: String(resolvedObjectName ?? '—').slice(0, 500),
        relatedId: null,
      };
      setImmediate(() =>
        this.eventEmitter.emit(EVENT_OPERATION_LOG_CREATED, entry),
      );
    };

    return next.handle().pipe(
      tap((data) => {
        const response = context.switchToHttp().getResponse<FastifyReply>();
        record(response.statusCode, data);
      }),
      catchError((error: unknown) => {
        const statusCode =
          typeof error === 'object' &&
          error !== null &&
          'getStatus' in error &&
          typeof (error as { getStatus?: unknown }).getStatus === 'function'
            ? (error as { getStatus: () => number }).getStatus()
            : 500;
        record(statusCode, {
          status: 'FAILED',
          httpStatus: statusCode,
          failureReason:
            statusCode >= 500
              ? '服务处理异常，本次操作未确认完成'
              : `请求未通过检查（HTTP ${statusCode}），本次操作未确认完成`,
        });
        return throwError(() => error);
      }),
    );
  }
}
