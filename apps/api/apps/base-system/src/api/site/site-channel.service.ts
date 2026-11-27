import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EpaySite, Prisma } from '@prisma/client';
import mysql from 'mysql2/promise';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { parseMembers } from '../../../../../libs/shared/site-connector/src/business-mapping';
import {
  ChannelConfigDto,
  ChannelStatusDto,
  DeleteChannelDto,
  UpdateChannelDto,
} from './dto/channel.dto';
import { decryptSiteSecret } from './site-credentials';
import {
  channelFields,
  channelRevision,
  directChannelReference,
  mergeChannelConfig,
  parseChannelConfig,
  readSourceChannel,
} from './source-channel';
import { SiteService } from './site.service';
import { ChannelAdvancedDto } from './dto/channel-advanced.dto';
import { advancedFields, validateAdvanced } from './channel-advanced';
import { availablePaymentInterfaces } from '../../../../../libs/shared/site-connector/src/payment-interfaces';
import {
  configurationMetadata,
  validateAlipayConfiguration,
} from './channel-configuration';

type LoggedChange = { field: string; before: unknown; after: unknown };
const changedFields = (items: LoggedChange[]) =>
  items.filter(
    (item) => String(item.before ?? '') !== String(item.after ?? ''),
  );

@Injectable()
export class SiteChannelService implements OnModuleDestroy {
  private readonly connectionPools = new Map<
    string,
    { signature: string; pool: mysql.Pool }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SiteService,
  ) {}

  private async site(id: string) {
    const site = await this.prisma.epaySite.findUnique({ where: { id } });
    if (!site) throw new NotFoundException('站点不存在');
    if (
      site.structureStatus !== 'COMPATIBLE' ||
      !site.dbPasswordEncrypted ||
      site.tablePrefix == null
    )
      throw new ConflictException('请等待站点完成自动接入后再操作');
    return site;
  }

  private async connection(site: EpaySite): Promise<mysql.PoolConnection> {
    const signature = JSON.stringify([
      site.dbHost,
      site.dbPort,
      site.dbName,
      site.dbUser,
      site.dbPasswordEncrypted,
    ]);
    let entry = this.connectionPools.get(site.id);
    if (!entry || entry.signature !== signature) {
      // 配置变化时淘汰旧池；空闲连接自动回收，连续操作复用已完成的握手。
      if (entry) void entry.pool.end().catch(() => {});
      const pool = mysql.createPool({
        host: site.dbHost,
        port: site.dbPort,
        user: site.dbUser,
        database: site.dbName,
        password: decryptSiteSecret(
          site.id,
          'db-password',
          site.dbPasswordEncrypted!,
        ),
        connectTimeout: 10000,
        dateStrings: true,
        supportBigNumbers: true,
        bigNumberStrings: true,
        connectionLimit: 2,
        maxIdle: 1,
        idleTimeout: 60000,
        enableKeepAlive: true,
      });
      entry = { signature, pool };
      this.connectionPools.set(site.id, entry);
    }
    return entry.pool.getConnection();
  }

  async onModuleDestroy() {
    await Promise.allSettled(
      [...this.connectionPools.values()].map(({ pool }) => pool.end()),
    );
    this.connectionPools.clear();
  }

  private revision(site: EpaySite, row: Record<string, unknown>) {
    return channelRevision(row, site.dbPasswordEncrypted!);
  }

  async detail(
    siteId: string,
    code: string,
    configuration: boolean | 'advanced' = false,
  ) {
    const site = await this.site(siteId);
    let connection: mysql.PoolConnection | undefined;
    try {
      connection = await this.connection(site);
      const row = await readSourceChannel(
        connection,
        site.tablePrefix!,
        code,
        true,
      );
      const revision = this.revision(site, row);
      if (configuration === 'advanced')
        return { code, revision, ...advancedFields(row) };
      if (!configuration)
        return {
          code,
          ...channelFields(row),
          revision,
          catalog: await this.catalog(connection, site.tablePrefix!),
        };
      return {
        code,
        revision,
        ...configurationMetadata(row),
      };
    } catch (error) {
      this.fail(error);
    } finally {
      connection?.release();
    }
  }

  private async catalog(connection: mysql.Connection, prefix: string) {
    const [types] = await connection.query<mysql.RowDataPacket[]>({
      sql:
        'SELECT id,name,showname,status FROM ' +
        mysql.escapeId(prefix + 'type'),
      timeout: 10000,
    });
    const [plugins] = await connection.query<mysql.RowDataPacket[]>({
      sql:
        'SELECT name,title,pay_types FROM ' +
        mysql.escapeId(prefix + 'plugin') +
        " WHERE type='payment'",
      timeout: 10000,
    });
    return {
      types: types.map((type) => ({
        id: Number(type.id),
        code: String(type.name),
        label: String(type.showname),
        enabled: Number(type.status) === 1,
      })),
      plugins: plugins.map((plugin) => ({
        name: String(plugin.name),
        title: String(plugin.title),
        paymentTypes: String(plugin.pay_types ?? '')
          .split(',')
          .filter(Boolean),
      })),
    };
  }

  async update(siteId: string, code: string, dto: UpdateChannelDto) {
    if (
      !dto.name.trim() ||
      Number(dto.rate) > 100 ||
      (dto.costRate && Number(dto.costRate) > 100)
    )
      throw new BadRequestException('通道名不能为空，比例必须在 0 到 100 之间');
    if (
      dto.minAmount &&
      Number(dto.maxAmount) > 0 &&
      Number(dto.minAmount) > Number(dto.maxAmount)
    )
      throw new BadRequestException('单笔最小金额不能大于单笔最大金额');
    return this.mutate(siteId, code, async (connection, site, row) => {
      this.expectRevision(site, row, dto.revision);
      const catalog = await this.catalog(connection, site.tablePrefix!);
      const type = catalog.types.find((type) => type.id === dto.paymentTypeId);
      const plugin = catalog.plugins.find(
        (plugin) => plugin.name === dto.plugin,
      );
      const changed =
        Number(row.type) !== dto.paymentTypeId || row.plugin !== dto.plugin;
      if (
        changed &&
        (!type?.enabled || !plugin?.paymentTypes.includes(type.code))
      )
        throw new BadRequestException(
          '请选择已启用的支付方式及兼容的已安装支付插件',
        );
      if (changed && (Number(row.status) !== 0 || !dto.resetConfiguration))
        throw new ConflictException(
          '请先停止通道，并确认更换支付插件会清除旧密钥配置',
        );
      if (Number(row.type) !== dto.paymentTypeId) {
        await this.checkCentralReferences(siteId, code);
        await this.checkSourceReferences(connection, site, code);
      }
      await connection.query({
        sql: `UPDATE ${mysql.escapeId(site.tablePrefix + 'channel')} SET name=?,mode=?,rate=?,costrate=?,daytop=?,daymaxorder=?,paymin=?,paymax=?,type=?,plugin=?,config=?,apptype=? WHERE id=?`,
        values: [
          dto.name.trim(),
          dto.mode,
          dto.rate,
          dto.costRate || null,
          dto.dailyLimit,
          dto.dailyOrderLimit,
          dto.minAmount || null,
          dto.maxAmount || null,
          dto.paymentTypeId,
          dto.plugin,
          changed ? '{}' : String(row.config ?? '{}'),
          changed ? null : row.apptype,
          code,
        ],
        timeout: 10000,
      });
      return {
        name: dto.name.trim(),
        plugin: dto.plugin,
        paymentTypeId: String(dto.paymentTypeId),
        auditChanges: changedFields([
          { field: 'name', before: row.name, after: dto.name.trim() },
          { field: 'mode', before: row.mode, after: dto.mode },
          { field: 'rate', before: row.rate, after: dto.rate },
          {
            field: 'costRate',
            before: row.costrate,
            after: dto.costRate || null,
          },
          {
            field: 'paymentType',
            before:
              catalog.types.find((item) => item.id === Number(row.type))
                ?.label ?? String(row.type),
            after: type?.label ?? String(dto.paymentTypeId),
          },
          {
            field: 'plugin',
            before:
              catalog.plugins.find((item) => item.name === row.plugin)?.title ??
              String(row.plugin),
            after: plugin?.title ?? dto.plugin,
          },
          { field: 'dailyLimit', before: row.daytop, after: dto.dailyLimit },
          {
            field: 'dailyOrderLimit',
            before: row.daymaxorder,
            after: dto.dailyOrderLimit,
          },
          {
            field: 'minAmount',
            before: row.paymin,
            after: dto.minAmount || null,
          },
          {
            field: 'maxAmount',
            before: row.paymax,
            after: dto.maxAmount || null,
          },
        ]),
        details: {
          ...(changed ? { appId: '' } : {}),
          paymentTypeCode: type?.code,
          pluginTitle: plugin?.title,
          availableInterfaces: availablePaymentInterfaces(
            dto.plugin,
            changed ? null : row.apptype,
          ),
          mode: dto.mode,
          rate: dto.rate,
          costRate: dto.costRate || undefined,
          dailyLimit: String(dto.dailyLimit),
          dailyOrderLimit: dto.dailyOrderLimit,
          minAmount: dto.minAmount || undefined,
          maxAmount: dto.maxAmount || undefined,
        },
      };
    });
  }

  async advanced(siteId: string, code: string, dto: ChannelAdvancedDto) {
    validateAdvanced(dto);
    return this.mutate(siteId, code, async (connection, site, row) => {
      this.expectRevision(site, row, dto.revision);
      await connection.query({
        sql: `UPDATE ${mysql.escapeId(site.tablePrefix + 'channel')} SET daytop=?,daymaxorder=?,paymin=?,paymax=?,rate_limit_seconds=?,rate_limit_count=?,timestart=?,timestop=?,payfee_lessthan=?,payfee_mincost=?,ordername=?,ordername_rules=? WHERE id=?`,
        values: [
          dto.dailyLimit,
          dto.dailyOrderLimit,
          dto.minAmount || null,
          dto.maxAmount || null,
          dto.rateLimitSeconds,
          dto.rateLimitCount,
          dto.startHour === '' ? null : Number(dto.startHour),
          dto.endHour === '' ? null : Number(dto.endHour),
          dto.feeThreshold || null,
          dto.minFee || null,
          dto.orderName || null,
          JSON.stringify(
            dto.orderNameRules.map((rule) => ({
              name: rule.name.trim(),
              min: rule.min,
              max: rule.max,
            })),
          ),
          code,
        ],
        timeout: 10000,
      });
      return {
        auditChanges: changedFields([
          { field: 'dailyLimit', before: row.daytop, after: dto.dailyLimit },
          {
            field: 'dailyOrderLimit',
            before: row.daymaxorder,
            after: dto.dailyOrderLimit,
          },
          {
            field: 'minAmount',
            before: row.paymin,
            after: dto.minAmount || null,
          },
          {
            field: 'maxAmount',
            before: row.paymax,
            after: dto.maxAmount || null,
          },
          {
            field: 'rateLimitSeconds',
            before: row.rate_limit_seconds,
            after: dto.rateLimitSeconds,
          },
          {
            field: 'rateLimitCount',
            before: row.rate_limit_count,
            after: dto.rateLimitCount,
          },
          {
            field: 'startHour',
            before: row.timestart,
            after: dto.startHour || null,
          },
          {
            field: 'endHour',
            before: row.timestop,
            after: dto.endHour || null,
          },
          {
            field: 'feeThreshold',
            before: row.payfee_lessthan,
            after: dto.feeThreshold || null,
          },
          {
            field: 'minFee',
            before: row.payfee_mincost,
            after: dto.minFee || null,
          },
          {
            field: 'orderName',
            before: row.ordername,
            after: dto.orderName || null,
          },
          {
            field: 'orderNameRules',
            before: row.ordername_rules,
            after: dto.orderNameRules,
          },
        ]),
        details: {
          dailyLimit: String(dto.dailyLimit),
          dailyOrderLimit: dto.dailyOrderLimit,
          minAmount: dto.minAmount || null,
          maxAmount: dto.maxAmount || null,
        },
      };
    });
  }

  async status(siteId: string, code: string, dto: ChannelStatusDto) {
    return this.mutate(siteId, code, async (connection, site, row) => {
      if (Number(row.status) !== dto.expectedStatus)
        throw new ConflictException('通道状态已变化，请刷新后重试');
      if (dto.status === 0) await this.blockRestrictionRestore(siteId, code);
      return this.writeStatus(connection, site, row, code, dto.status);
    });
  }

  async blockRestrictionRestore(siteId: string, code: string) {
    await this.prisma.restrictionChannelHold.updateMany({
      where: { channelId: `${siteId}:channel:${code}`, state: { in: ['CLOSED', 'CLOSING', 'RESTORING'] } },
      data: { state: 'BLOCKED' },
    });
  }

  async restrictionStatus(siteId: string, code: string, status: 0 | 1, decide: (channel: {
    sourceStatus: number; dayStatus: number; appId: string; fingerprint: string;
  }) => Promise<boolean>, confirm: () => Promise<void>, rollback: () => Promise<void>) {
    return this.mutate(siteId, code, async (connection, site, row) => {
      const appId = parseChannelConfig(row.config).appid;
      const { status: _status, daystatus: _daystatus, __engine: _engine, ...identity } = row;
      const fingerprint = channelRevision(identity, `${siteId}:${site.syncRevision}`);
      if (!(await decide({
        sourceStatus: Number(row.status), dayStatus: Number(row.daystatus),
        appId: typeof appId === 'string' ? appId.trim() : '', fingerprint,
      }))) return {};
      return { ...await this.writeStatus(connection, site, row, code, status), afterCommit: confirm };
    }, rollback);
  }

  private async writeStatus(connection: mysql.Connection, site: EpaySite, row: mysql.RowDataPacket, code: string, status: number) {
    await connection.query({
      sql: `UPDATE ${mysql.escapeId(site.tablePrefix + 'channel')} SET status=? WHERE id=?`,
      values: [status, code],
      timeout: 10000,
    });
    return {
      sourceStatus: status,
      dayStatus: Number(row.daystatus),
      status: status === 1 && Number(row.daystatus) === 0 ? ('ENABLED' as const) : ('DISABLED' as const),
      auditChanges: changedFields([{ field: 'status', before: Number(row.status), after: status }]),
    };
  }

  async configure(siteId: string, code: string, dto: ChannelConfigDto) {
    return this.mutate(siteId, code, async (connection, site, row) => {
      this.expectRevision(site, row, dto.revision);
      const config = Object.keys(dto.changes).length
        ? mergeChannelConfig(row.config, dto.changes)
        : JSON.stringify(parseChannelConfig(row.config));
      const appId = parseChannelConfig(config).appid;
      const apptype =
        dto.apptype ??
        String(row.apptype ?? '')
          .split(',')
          .filter(Boolean);
      if (row.plugin === 'alipay') validateAlipayConfiguration(config, apptype);
      else if (dto.apptype !== undefined)
        throw new BadRequestException('当前插件不支持修改可用接口');
      await connection.query({
        sql: `UPDATE ${mysql.escapeId(site.tablePrefix + 'channel')} SET config=?,apptype=? WHERE id=?`,
        values: [
          config,
          dto.apptype === undefined ? row.apptype : apptype.join(','),
          code,
        ],
        timeout: 10000,
      });
      return {
        auditChanges: [
          ...Object.keys(dto.changes).map((field) => ({
            field: `configuration.${field}`,
            before: '已隐藏',
            after: '已修改（具体值已隐藏）',
          })),
          ...(dto.apptype === undefined ||
          dto.apptype.join(',') === String(row.apptype ?? '')
            ? []
            : [
                {
                  field: 'apptype',
                  before: row.apptype ?? '',
                  after: dto.apptype.join(','),
                },
              ]),
        ],
        details: {
          appId:
            typeof appId === 'string' && appId.trim().length <= 191
              ? appId.trim()
              : '',
          availableInterfaces: availablePaymentInterfaces(
            String(row.plugin),
            apptype.join(','),
          ),
        },
      };
    });
  }

  async remove(
    siteId: string,
    code: string,
    dto: DeleteChannelDto,
    actor?: { uid: string; domain: string },
  ) {
    await this.sites.verifyCurrentPassword(dto.password, actor);
    return this.mutate(siteId, code, async (connection, site, row) => {
      this.expectRevision(site, row, dto.revision);
      if (Number(row.status) !== 0)
        throw new ConflictException('请先停止通道，再删除');
      await this.checkCentralReferences(siteId, code);
      await this.checkSourceReferences(connection, site, code);
      const table = (name: string) => mysql.escapeId(site.tablePrefix + name);
      await connection.query({
        sql: `DELETE FROM ${table('channel')} WHERE id=?`,
        values: [code],
        timeout: 10000,
      });
      return { deleted: true as const };
    });
  }

  private async checkSourceReferences(
    connection: mysql.Connection,
    site: EpaySite,
    code: string,
  ) {
    const table = (name: string) => mysql.escapeId(site.tablePrefix + name);
    const [rolls] = await connection.query<mysql.RowDataPacket[]>({
      sql: `SELECT info FROM ${table('roll')} FOR UPDATE`,
      timeout: 10000,
    });
    if (
      rolls.some((roll) =>
        parseMembers(String(roll.info ?? '')).some(
          (member) => member.channelCode === code,
        ),
      )
    )
      throw new ConflictException('通道仍在轮询组中，请先移除轮询组成员');
    const [groups] = await connection.query<mysql.RowDataPacket[]>({
      sql: `SELECT info FROM ${table('group')} FOR UPDATE`,
      timeout: 10000,
    });
    if (groups.some((group) => directChannelReference(group.info, code)))
      throw new ConflictException(
        '通道仍被用户组支付路由引用，请先调整原站点路由',
      );
    const [children] = await connection.query<mysql.RowDataPacket[]>({
      sql: `SELECT id FROM ${table('subchannel')} WHERE channel=? FOR UPDATE`,
      values: [code],
      timeout: 10000,
    });
    if (children.length)
      throw new ConflictException('通道仍有关联子通道，请先在原站点处理子通道');
  }

  private async checkCentralReferences(siteId: string, code: string) {
    const targets = await this.prisma.strategyTarget.count({
      where: { siteId, channelCode: code },
    });
    const bindings = await this.prisma.accountBinding.count({
      where: { siteId, channelCode: code },
    });
    if (bindings || targets)
      throw new ConflictException(
        '通道仍被中心账号绑定或策略引用，请先解除关联',
      );
  }

  private expectRevision(
    site: EpaySite,
    row: Record<string, unknown>,
    revision: string,
  ) {
    if (this.revision(site, row) !== revision)
      throw new ConflictException('原站点通道已变化，请重新打开后再保存');
  }

  private async acquireLease(siteId: string, owner: string) {
    const deadline = Date.now() + 8000;
    // 只重试抢锁，不重放写入；获得锁后仍重新读取并校验原站点状态。
    while (Date.now() < deadline) {
      const claimed = await this.prisma.epaySite.updateMany({
        where: {
          id: siteId,
          OR: [
            { connectionLeaseUntil: null },
            { connectionLeaseUntil: { lt: new Date() } },
          ],
        },
        data: {
          connectionLeaseOwner: owner,
          connectionLeaseUntil: new Date(Date.now() + 90000),
        },
      });
      if (claimed.count) return;
      const site = await this.prisma.epaySite.findUnique({
        where: { id: siteId },
        select: { id: true },
      });
      if (!site) throw new NotFoundException('站点不存在');
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(200, remaining)),
      );
    }
    throw new ConflictException('等待站点空闲超时，本次操作未执行，请稍后重试');
  }

  private async mutate(
    siteId: string,
    code: string,
    change: (
      connection: mysql.Connection,
      site: EpaySite,
      row: mysql.RowDataPacket,
    ) => Promise<{
      name?: string;
      plugin?: string;
      paymentTypeId?: string;
      details?: Record<string, unknown>;
      sourceStatus?: number;
      dayStatus?: number;
      status?: 'ENABLED' | 'DISABLED';
      deleted?: true;
      auditChanges?: LoggedChange[];
      afterCommit?: () => Promise<void>;
    }>,
    afterRollback?: () => Promise<void>,
  ) {
    const owner = `channel:${randomUUID()}`;
    await this.acquireLease(siteId, owner);
    let connection: mysql.PoolConnection | undefined;
    let committed = false;
    let commitStarted = false;
    try {
      const site = await this.site(siteId);
      connection = await this.connection(site);
      await connection.beginTransaction();
      const row = await readSourceChannel(
        connection,
        site.tablePrefix!,
        code,
        true,
        true,
      );
      const result = await change(connection, site, row);
      // Recheck the lease and settings before committing the source transaction.
      const current = await this.prisma.epaySite.findUnique({
        where: { id: siteId },
      });
      if (
        current?.connectionLeaseOwner !== owner ||
        current.syncRevision !== site.syncRevision ||
        !current.connectionLeaseUntil ||
        current.connectionLeaseUntil <= new Date()
      )
        throw new ConflictException('站点配置已变化，请重试');
      commitStarted = true;
      await connection.commit();
      committed = true;
      await result.afterCommit?.();
      if (result.deleted) {
        await this.blockRestrictionRestore(siteId, code);
        await this.prisma.epayChannel.deleteMany({ where: { siteId, code } });
      }
      else {
        const channel = await this.prisma.epayChannel.findUnique({
          where: { siteId_code: { siteId, code } },
        });
        const { details, deleted, auditChanges, afterCommit, ...fields } = result;
        if (Object.keys(fields).length || details) await this.prisma.epayChannel.updateMany({
          where: { siteId, code },
          data: {
            ...fields,
            ...(details
              ? {
                  details: {
                    ...((channel?.details as Record<string, unknown>) ?? {}),
                    ...details,
                  } as Prisma.InputJsonValue,
                }
              : {}),
          },
        });
        if (result.status)
          await this.prisma.epayPollingMember.updateMany({
            where: { channelId: `${siteId}:channel:${code}` },
            data: { enabled: result.status === 'ENABLED' },
          });
      }
      return {
        code,
        saved: true,
        ...(result.sourceStatus === undefined
          ? {}
          : {
              sourceStatus: result.sourceStatus,
              dayStatus: result.dayStatus,
              status: result.status,
            }),
        audit: {
          siteId,
          siteName: site.name,
          targetName: `${String(row.name)}（通道 ${code}）`,
          objectName: `${site.name} / ${String(row.name)}（通道 ${code}）`,
          changes: result.deleted
            ? [{ field: 'channel', before: String(row.name), after: '已删除' }]
            : (result.auditChanges ?? []),
        },
      };
    } catch (error) {
      if (!committed && connection) {
        const rolledBack = await connection.rollback().then(() => true, () => { connection?.destroy(); return false; });
        if (!commitStarted && rolledBack) await afterRollback?.();
      }
      if (committed)
        throw new ServiceUnavailableException(
          '原站点已保存，中心列表将在下次同步更新，请勿重复提交',
        );
      this.fail(error);
    } finally {
      connection?.release();
      await this.prisma.epaySite.updateMany({
        where: { id: siteId, connectionLeaseOwner: owner },
        data: {
          connectionLeaseOwner: null,
          connectionLeaseUntil: null,
          // 中心数据已更新，短暂合并后续同步，避免连续操作被新一轮同步打断。
          nextConnectionAt: new Date(Date.now() + (committed ? 5000 : 0)),
          ...(committed ? { syncRevision: { increment: 1 } } : {}),
        },
      });
    }
  }

  private fail(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const code = (error as { code?: string })?.code;
    if (
      code === 'ER_TABLEACCESS_DENIED_ERROR' ||
      code === 'ER_DBACCESS_DENIED_ERROR' ||
      code === 'ER_ACCESS_DENIED_ERROR'
    )
      throw new BadRequestException(
        '数据库账号没有所需权限，请检查原站点数据库授权',
      );
    if (code === 'ER_BAD_FIELD_ERROR' || code === 'ER_NO_SUCH_TABLE')
      throw new ConflictException('原站点通道管理字段不兼容，请先在原站点管理');
    throw new ServiceUnavailableException('原站点操作未完成，请检查连接后重试');
  }
}
