import { createHash } from 'node:crypto';
import type { SyncStart, OrderData } from './site-data';
import { instant, wallTime, money, parseMembers } from './business-mapping';
import mysql, { Pool } from 'mysql2/promise';
import type { StructureReport } from './contracts';
import { validateStructure } from './structure';
import type { SiteControlCommand, SiteControlResult } from './control';
import { availablePaymentInterfaces } from './payment-interfaces';
import { validateMemberChange } from './polling-members';
import { changedOrderBuckets, MAX_ORDER_BUCKETS, ORDER_BUCKET_PREFIX_LENGTH, orderBucketRange, orderManifest } from './order-manifest';
import type { OrderManifest } from './order-manifest';

const ORDER_COLUMNS = 'trade_no,uid,type,channel,subchannel,money,realmoney,status,addtime,endtime';

export class MysqlEpayAdapter {
  private readonly pool: Pool;
  private readonly database: string;
  private tablePrefix: string;

  constructor(config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    tablePrefix?: string;
  }) {
    this.database = config.database;
    const { tablePrefix, ...connection } = config;
    this.tablePrefix = tablePrefix ?? '';
    this.pool = mysql.createPool({
      ...connection,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      connectionLimit: 2,
      enableKeepAlive: true,
      connectTimeout: 10_000,
    });
  }

  setTablePrefix(prefix: string) {
    if (!/^[a-zA-Z0-9_]{0,64}$/.test(prefix)) throw new Error('Invalid prefix');
    this.tablePrefix = prefix;
  }

  async probe(): Promise<StructureReport> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>({
      sql: `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
      timeout: 10_000,
    });
    const [columns] = await this.pool.query<mysql.RowDataPacket[]>({
      sql: `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      timeout: 10_000,
    });
    const byTable = new Map<string, string[]>();
    for (const column of columns) {
      const key = String(column.tableName);
      if (!byTable.has(key)) byTable.set(key, []);
      byTable.get(key)!.push(String(column.name));
    }
    const tables = rows.map((row) => ({
      name: String(row.name),
      columns: byTable.get(String(row.name)) ?? [],
    }));
    if (
      tables.length > 1000 ||
      tables.some((table) => table.columns.length > 1000)
    ) {
      throw new Error('Structure report exceeds supported limits');
    }
    const candidates = tables
      .map((table) => table.name)
      .filter((name) => /channel|pay|order|poll|config/i.test(name));
    const validation = validateStructure(tables, this.tablePrefix);
    let siteVersion: string | undefined;
    if (validation.reason === 'MATCHED') {
      // 只读取版本这一项，不读取 config 中的其他设置或支付密钥。
      const [versions] = await this.pool.query<mysql.RowDataPacket[]>({
        sql: `SELECT v FROM ${mysql.escapeId(`${validation.tablePrefix}config`)} WHERE k = ? LIMIT 1`,
        values: ['version'],
        timeout: 10_000,
      });
      const value = versions[0]?.v;
      if (typeof value === 'string' && /^\d{1,20}$/.test(value))
        siteVersion = value;
    }
    return {
      database: this.database,
      tables,
      candidates,
      checkedAt: new Date().toISOString(),
      validation,
      ...(siteVersion ? { siteVersion } : {}),
    };
  }

  async *snapshot(
    prefix: string,
    timezone: string,
    revision: number,
    previous?: OrderManifest,
  ): AsyncGenerator<{ start: SyncStart; manifest?: OrderManifest; changedBuckets?: string[] } | { orders: OrderData[] }> {
    if (!/^[a-zA-Z0-9_]{0,64}$/.test(prefix)) throw new Error('Invalid prefix');
    const table = (name: string) => mysql.escapeId(prefix + name);
    const connection = await this.pool.getConnection();
    try {
      const [engines] = await connection.query<mysql.RowDataPacket[]>({
        sql: 'SELECT ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',
        values: ['type', 'channel', 'roll', 'order'].map(
          (name) => prefix + name,
        ),
        timeout: 10_000,
      });
      if (
        engines.length !== 4 ||
        engines.some((row) => String(row.ENGINE).toLowerCase() !== 'innodb')
      )
        throw new Error('Consistent reads require InnoDB');
      await connection.query('SET SESSION group_concat_max_len = 2097152');
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query(
        'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
      );
      const windowEnd = new Date(Math.floor(Date.now() / 1000) * 1000);
      // 全量快照仍用现有窗口字段标记覆盖范围，源库查询只限制截止时间。
      const windowStart = new Date('1000-01-01T00:00:00.000Z');
      const cutoff = wallTime(windowEnd, timezone);
      const read = async (sql: string, values: unknown[] = []) =>
        (
          await connection.query<mysql.RowDataPacket[]>({
            sql,
            values,
            timeout: 30_000,
          })
        )[0];
      const [types] = await connection.query<
        (mysql.RowDataPacket & {
          id: string;
          name: string;
          showname: string;
          status: number;
        })[]
      >({
        sql:
          'SELECT id, name, showname, status FROM ' +
          table('type') +
          ' ORDER BY id',
        timeout: 30_000,
      });
      const typeNames = new Map(types.map(row => [String(row.id), String(row.showname || row.name || row.id)]));
      const typeName = (id: unknown) => typeNames.get(String(id)) ?? String(id);
      const columns = await read(
        'SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
        [prefix + 'channel'],
      );
      const available = new Set(columns.map((row) => String(row.name)));
      const extra = [
        'mode',
        'rate',
        'costrate',
        'daytop',
        'daymaxorder',
        'paymin',
        'paymax',
        'apptype',
      ].filter((name) => available.has(name));
      const channels = await read(
        'SELECT id, name, type, plugin, status, daystatus' +
          extra.map((name) => ', ' + mysql.escapeId(name)).join('') +
          // 只在数据库内提取 APPID，私钥等配置不离开站点库。
          (available.has('config')
            ? ", IF(JSON_VALID(config), JSON_UNQUOTE(JSON_EXTRACT(config, '$.appid')), NULL) AS appId"
            : '') +
          ' FROM ' +
          table('channel') +
          ' ORDER BY id',
      );
      const pluginColumns = await read(
        'SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
        [prefix + 'plugin'],
      );
      const plugins = ['name', 'title', 'type'].every((name) =>
        pluginColumns.some((row) => row.name === name),
      )
        ? await read(
            'SELECT name, title FROM ' + table('plugin') + ' WHERE type = ?',
            ['payment'],
          )
        : [];
      // 全库成功订单按通道汇总，与同步窗口分开，不上传额外订单明细。
      const incomeRows = await read(
        'SELECT channel, COALESCE(SUM(money), 0) AS successAmount, COUNT(*) AS successCount FROM ' +
          table('order') + ' WHERE status > 0 GROUP BY channel',
      );
      const incomeByChannel = new Map(incomeRows.map(row => [String(row.channel), {
        totalSuccessAmount: String(row.successAmount),
        totalSuccessCount: Number(row.successCount),
      }]));
      const details = (row: mysql.RowDataPacket) => ({
        ...(incomeByChannel.get(String(row.id)) ?? { totalSuccessAmount: '0.00', totalSuccessCount: 0 }),
        appId: typeof row.appId === 'string' && row.appId.trim().length <= 191
          ? row.appId.trim() : '',
        availableInterfaces: availablePaymentInterfaces(
          String(row.plugin),
          row.apptype,
        ),
        paymentTypeCode: String(
          types.find((type) => String(type.id) === String(row.type))?.name ??
            '',
        ),
        pluginTitle: String(
          plugins.find((plugin) => plugin.name === row.plugin)?.title ||
            row.plugin,
        ),
        ...(row.mode != null ? { mode: Number(row.mode) } : {}),
        ...(row.rate != null ? { rate: String(row.rate) } : {}),
        ...(row.costrate != null && row.costrate !== ''
          ? { costRate: String(row.costrate) }
          : {}),
        ...(row.daytop != null ? { dailyLimit: String(row.daytop) } : {}),
        ...(row.daymaxorder != null
          ? { dailyOrderLimit: Number(row.daymaxorder) }
          : {}),
        ...(row.paymin != null && row.paymin !== ''
          ? { minAmount: String(row.paymin) }
          : {}),
        ...(row.paymax != null && row.paymax !== ''
          ? { maxAmount: String(row.paymax) }
          : {}),
      });
      const rolls = await read(
        'SELECT id, name, type, kind, info, status, ' +
          mysql.escapeId('index') +
          ' AS position FROM ' +
          table('roll') +
          ' ORDER BY id',
      );
      // 只核对白名单字段。校验串被截断的分段每轮重新读取，避免误判为无变化。
      const buckets = await read(
        'SELECT prefix, total, IF(OCTET_LENGTH(hashes) = total * 64, SHA2(hashes, 256), NULL) AS digest ' +
          `FROM (SELECT LEFT(trade_no, ${ORDER_BUCKET_PREFIX_LENGTH}) AS prefix, COUNT(*) AS total, ` +
          `GROUP_CONCAT(SHA2(JSON_ARRAY(${ORDER_COLUMNS}), 256) ORDER BY trade_no SEPARATOR '') AS hashes ` +
          `FROM ${table('order')} WHERE addtime < ? GROUP BY prefix LIMIT ${MAX_ORDER_BUCKETS + 1}) AS order_buckets`,
        [cutoff],
      );
      const typeNamesDigest = createHash('sha256').update(JSON.stringify([...typeNames])).digest('hex');
      const manifest = orderManifest(typeNamesDigest, buckets.map(row => ({
        prefix: row.prefix, count: Number(row.total), digest: row.digest,
      })));
      const expectedCount = manifest
        ? manifest.buckets.reduce((sum, bucket) => sum + bucket.count, 0)
        : Number((await read(`SELECT COUNT(*) AS total FROM ${table('order')} WHERE addtime < ?`, [cutoff]))[0].total);
      const changedBuckets = manifest ? changedOrderBuckets(manifest, previous) : undefined;
      yield {
        manifest,
        changedBuckets,
        start: {
          revision,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          mappingVersion: 'epay-pro-2070-status-v2',
          expectedCount,
          channels: channels.map((row) => ({
            code: String(row.id),
            name: String(row.name),
            paymentTypeId: String(row.type),
            paymentTypeName: typeName(row.type),
            plugin: String(row.plugin),
            sourceStatus: Number(row.status),
            dayStatus: Number(row.daystatus),
            details: details(row),
          })),
          pollingGroups: rolls.map((row) => ({
            code: String(row.id),
            name: String(row.name),
            paymentTypeId: String(row.type),
            paymentTypeName: typeName(row.type),
            sourceStatus: Number(row.status),
            kind: Number(row.kind),
            position: Number(row.position),
            members: parseMembers(String(row.info ?? ''), String(row.id)),
          })),
        },
      };
      const activeBuckets = new Set(manifest?.buckets.map(bucket => bucket.prefix));
      const ranges = changedBuckets?.filter(prefix => activeBuckets.has(prefix)).map(orderBucketRange) ?? [null];
      for (const range of ranges) {
        let cursor = '';
        while (true) {
          const rows = await read(
            `SELECT ${ORDER_COLUMNS} FROM ${table('order')} WHERE addtime < ? AND trade_no > ?` +
              (range ? ' AND trade_no BETWEEN ? AND ?' : '') + ' ORDER BY trade_no LIMIT 500',
            [cutoff, cursor, ...(range ? [range.gte, range.lte] : [])],
          );
          if (!rows.length) break;
          yield {
            orders: rows.map((row) => ({
              externalId: String(row.trade_no),
              merchantId: String(row.uid),
              paymentTypeId: String(row.type),
              paymentTypeName: typeName(row.type),
              channelCode: String(row.channel),
              subchannelCode: String(row.subchannel),
              amount: money(row.money),
              ...(row.realmoney !== null ? { realAmount: money(row.realmoney) } : {}),
              sourceStatus: String(row.status),
              occurredAt: instant(String(row.addtime), timezone),
              ...(row.endtime && !String(row.endtime).startsWith('0000-')
                ? { paidAt: instant(String(row.endtime), timezone) }
                : {}),
            })),
          };
          if (rows.length < 500) break;
          cursor = String(rows[rows.length - 1].trade_no);
        }
      }
    } finally {
      await connection.rollback().catch(() => {});
      connection.release();
    }
  }

  async control(command: SiteControlCommand): Promise<SiteControlResult> {
    if (!/^[a-zA-Z0-9_]{0,64}$/.test(this.tablePrefix)) {
      return { status: 'FAILED', failureReason: 'INVALID_TABLE_PREFIX' };
    }
    if (!command.idempotencyKey || !command.targetVersion) {
      return { status: 'FAILED', failureReason: 'INVALID_COMMAND' };
    }
    const table = (name: string) => mysql.escapeId(this.tablePrefix + name);
    const connection = await this.pool.getConnection();
    try {
      await connection.query('START TRANSACTION');
      let beforeState: Record<string, unknown>;
      let sql: string;
      let values: unknown[];
      if (command.action === 'SET_CHANNEL_STATUS') {
        const code = this.numericCode(command.target.channelCode);
        const desired = this.statusValue(command.desiredState.status);
        const expected = this.optionalStatus(command.expectedState.status);
        const [rows] = await connection.query<mysql.RowDataPacket[]>({
          sql: `SELECT id, status, daystatus FROM ${table('channel')} WHERE id = ? FOR UPDATE`,
          values: [code],
          timeout: 30_000,
        });
        const row = rows[0];
        if (!row) throw new Error('TARGET_NOT_FOUND');
        beforeState = {
          status: Number(row.status),
          dayStatus: Number(row.daystatus),
        };
        if (expected !== undefined && Number(row.status) !== expected)
          throw new Error('TARGET_CHANGED');
        sql = `UPDATE ${table('channel')} SET status = ? WHERE id = ?`;
        values = [desired, code];
      } else if (command.action === 'SET_POLLING_GROUP_STATUS') {
        const code = this.numericCode(command.target.groupCode);
        const desired = this.statusValue(command.desiredState.status);
        const expected = this.optionalStatus(command.expectedState.status);
        const [rows] = await connection.query<mysql.RowDataPacket[]>({
          sql: `SELECT id, status, info FROM ${table('roll')} WHERE id = ? FOR UPDATE`,
          values: [code],
          timeout: 30_000,
        });
        const row = rows[0];
        if (!row) throw new Error('TARGET_NOT_FOUND');
        beforeState = {
          status: Number(row.status),
          info: String(row.info ?? ''),
        };
        if (expected !== undefined && Number(row.status) !== expected)
          throw new Error('TARGET_CHANGED');
        sql = `UPDATE ${table('roll')} SET status = ? WHERE id = ?`;
        values = [desired, code];
      } else {
        const code = this.numericCode(command.target.groupCode);
        const expectedMembers = this.members(command.expectedState.members);
        const desiredMembers = this.members(command.desiredState.members);
        const adding = command.action === 'ADD_POLLING_MEMBER';
        // Lock all rolls for a non-reused addition so concurrent additions cannot
        // both observe a channel as unused in different groups.
        const [rows] = await connection.query<mysql.RowDataPacket[]>({
          sql: adding
            ? `SELECT id, type, status, info FROM ${table('roll')} ORDER BY id FOR UPDATE`
            : `SELECT id, status, info FROM ${table('roll')} WHERE id = ? FOR UPDATE`,
          values: adding ? [] : [code],
          timeout: 30_000,
        });
        const row = adding
          ? rows.find((row) => String(row.id) === code)
          : rows[0];
        if (!row) throw new Error('TARGET_NOT_FOUND');
        const currentMembers = this.membersFromInfo(String(row.info ?? ''));
        beforeState = { status: Number(row.status), members: currentMembers };
        const expectedStatus = this.optionalStatus(
          command.expectedState.status,
        );
        if (
          expectedStatus !== undefined &&
          Number(row.status) !== expectedStatus
        )
          throw new Error('TARGET_CHANGED');
        if (JSON.stringify(currentMembers) !== JSON.stringify(expectedMembers))
          throw new Error('TARGET_CHANGED');
        validateMemberChange(
          command.action,
          currentMembers,
          desiredMembers,
          command.desiredState.channelCode,
        );
        if (adding) {
          const channelCode = this.numericCode(
            command.desiredState.channelCode,
          );
          if (typeof command.desiredState.allowReuse !== 'boolean')
            throw new Error('INVALID_REUSE_SETTING');
          const [channels] = await connection.query<mysql.RowDataPacket[]>({
            sql: `SELECT id, type, status, daystatus FROM ${table('channel')} WHERE id = ? FOR UPDATE`,
            values: [channelCode],
            timeout: 30_000,
          });
          const channel = channels[0];
          if (
            !channel ||
            Number(channel.status) !== 1 ||
            Number(channel.daystatus) !== 0
          )
            throw new Error('CHANNEL_UNAVAILABLE');
          if (String(channel.type) !== String(row.type))
            throw new Error('PAYMENT_TYPE_MISMATCH');
          if (
            !command.desiredState.allowReuse &&
            rows.some(
              (other) =>
                String(other.id) !== code &&
                this.membersFromInfo(String(other.info ?? '')).some(
                  (member) => member.channelCode === channelCode,
                ),
            )
          )
            throw new Error('CHANNEL_ALREADY_IN_POLLING_GROUP');
        }
        sql = `UPDATE ${table('roll')} SET info = ? WHERE id = ?`;
        values = [
          desiredMembers
            .map((member) => `${member.channelCode}:${member.weight}`)
            .join(','),
          code,
        ];
      }
      await connection.query({ sql, values, timeout: 30_000 });
      await connection.commit();
      const actualState = await this.readControlState(connection, command);
      if (!this.matchesDesired(command, actualState)) {
        return {
          status: 'FAILED',
          beforeState,
          actualState,
          failureReason: 'READBACK_MISMATCH',
        };
      }
      return { status: 'SUCCEEDED', beforeState, actualState };
    } catch (error) {
      await connection.rollback().catch(() => {});
      return {
        status: 'FAILED',
        failureReason:
          error instanceof Error ? error.message : 'CONTROL_FAILED',
      };
    } finally {
      connection.release();
    }
  }

  private async readControlState(
    connection: mysql.PoolConnection,
    command: SiteControlCommand,
  ) {
    const table = (name: string) => mysql.escapeId(this.tablePrefix + name);
    const code = this.numericCode(
      command.action === 'SET_CHANNEL_STATUS'
        ? command.target.channelCode
        : command.target.groupCode,
    );
    const tableName =
      command.action === 'SET_CHANNEL_STATUS' ? 'channel' : 'roll';
    const [rows] = await connection.query<mysql.RowDataPacket[]>({
      sql:
        command.action === 'SET_CHANNEL_STATUS'
          ? `SELECT status, daystatus FROM ${table(tableName)} WHERE id = ?`
          : `SELECT status, info FROM ${table(tableName)} WHERE id = ?`,
      values: [code],
      timeout: 30_000,
    });
    const row = rows[0];
    if (!row) throw new Error('READBACK_NOT_FOUND');
    return command.action === 'SET_CHANNEL_STATUS'
      ? { status: Number(row.status), dayStatus: Number(row.daystatus) }
      : command.action === 'SET_POLLING_GROUP_STATUS'
        ? { status: Number(row.status), info: String(row.info ?? '') }
        : {
            status: Number(row.status),
            members: this.membersFromInfo(String(row.info ?? '')),
          };
  }

  private numericCode(value: unknown) {
    const code = String(value ?? '');
    if (!/^\d{1,20}$/.test(code)) throw new Error('INVALID_TARGET');
    return code;
  }

  private statusValue(value: unknown) {
    if (value !== 0 && value !== 1) throw new Error('INVALID_STATUS');
    return value;
  }

  private optionalStatus(value: unknown) {
    return value === undefined ? undefined : this.statusValue(value);
  }

  private members(value: unknown) {
    if (!Array.isArray(value) || value.length > 2000)
      throw new Error('INVALID_MEMBERS');
    const members = value.map((row) => {
      if (!row || typeof row !== 'object') throw new Error('INVALID_MEMBERS');
      const item = row as {
        channelCode?: unknown;
        weight?: unknown;
        position?: unknown;
      };
      const channelCode = this.numericCode(item.channelCode);
      const weight = Number(item.weight);
      const position = Number(item.position);
      if (
        !Number.isSafeInteger(weight) ||
        weight < 0 ||
        weight > 2147483647 ||
        !Number.isSafeInteger(position) ||
        position < 0
      )
        throw new Error('INVALID_MEMBERS');
      return { channelCode, weight, position };
    });
    if (new Set(members.map((row) => row.channelCode)).size !== members.length)
      throw new Error('INVALID_MEMBERS');
    return members.sort((a, b) => a.position - b.position);
  }

  private membersFromInfo(value: string) {
    return parseMembers(value).map((row) => ({ ...row }));
  }

  private matchesDesired(
    command: SiteControlCommand,
    actual: Record<string, unknown>,
  ) {
    if (
      command.action === 'SET_CHANNEL_STATUS' ||
      command.action === 'SET_POLLING_GROUP_STATUS'
    )
      return actual.status === command.desiredState.status;
    try {
      return (
        JSON.stringify(actual.members) ===
        JSON.stringify(this.members(command.desiredState.members))
      );
    } catch {
      return false;
    }
  }

  async close() {
    await this.pool.end();
  }
}
