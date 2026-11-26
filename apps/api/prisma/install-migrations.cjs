const { createHash } = require('node:crypto');
const { copyFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const mysql = require('mysql2/promise');

const baseline = '00000000000000_mysql_baseline';
const strategy = '202611020003_strategy_templates';
const notice = '202611241200_telegram_channel_status_template';
const library = '202611241300_telegram_channel_notice_library';
const file = (root, name) => join(root, 'migrations', name, 'migration.sql');
const digest = text => createHash('sha256').update(text).digest('hex');

function mysql57Scripts(root) {
  // 5.7 默认会为 TIMESTAMP 隐式设置零日期，严格模式会拒绝该建表语句。
  for (const entry of readdirSync(join(root, 'migrations'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = file(root, entry.name);
    const sql = readFileSync(path, 'utf8');
    const portable = sql.replace(/\bTIMESTAMP\(3\) NOT NULL(?=\s*[,;)])/gi, 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)')
      .replace(/\bTIMESTAMP\(3\)(?=\s*[,;)])/gi, 'TIMESTAMP(3) NULL');
    if (portable !== sql) writeFileSync(path, portable);
  }
  const path = file(root, baseline);
  writeFileSync(path, readFileSync(path, 'utf8').replace('JSON NOT NULL DEFAULT (JSON_ARRAY())', 'JSON NOT NULL'));
  // 5.7 不支持 TEXT 默认表达式。保留升级前的数据，并只回填原本应使用默认值的行。
  for (const name of [notice, library]) {
    const path = file(root, name);
    const sql = readFileSync(path, 'utf8');
    const literal = sql.match(/`channel_status_notice_template` TEXT NOT NULL DEFAULT \(('(?:[^']|'')*')\)/)[1];
    let portable = sql.replace(/((?:MEDIUM)?TEXT NOT NULL) DEFAULT \('(?:[^']|'')*'\)/g, '$1');
    if (name === notice) portable += `\nUPDATE telegram_bot SET channel_status_notice_template = ${literal};\n`;
    else portable = portable.replace('= DEFAULT\n', `= ${literal}\n`).replace('= DEFAULT\r\n', `= ${literal}\r\n`)
      + "\nUPDATE telegram_bot SET channel_status_notice_saved_templates = '[]';\n";
    writeFileSync(path, portable);
  }
}

function knownFailure(row) {
  if (row.finished_at || ![baseline, strategy].includes(row.migration_name)) return false;
  const raw = readFileSync(file(__dirname, row.migration_name), 'utf8');
  const sql = raw.replace(/\r\n/g, '\n');
  const checksums = [raw, sql, sql.replace(/\n/g, '\r\n')].map(digest);
  if (!checksums.includes(row.checksum)) return false;
  const log = row.logs || '';
  return row.migration_name === baseline ? (/1064/.test(log) && /JSON_ARRAY/i.test(log) && /query number 59\b/.test(log))
    || (/1067/.test(log) && /updated_at/.test(log) && /query number 1\b/.test(log))
    : /3780/.test(log) && /strategy_group_template_id_fkey/.test(log) && /query number 4\b/.test(log);
}

async function alignPartialSchema(db, tables, name) {
  const owned = new Set();
  for (const source of [baseline, strategy]) {
    for (const match of readFileSync(file(__dirname, source), 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?`(\w+)`/gi)) owned.add(match[1]);
  }
  // JWT 迁移已把两个长索引列改为 ASCII；这张独立表没有字符串外键。
  if (name === strategy) owned.delete('sys_tokens');
  const [[{ database }]] = await db.query('SELECT DATABASE() AS `database`');
  await db.query('ALTER DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
  await db.query('SET SESSION FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of tables) {
      if (owned.has(table.name) && table.collation !== 'utf8mb4_unicode_ci') {
        await db.query('ALTER TABLE ?? CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [table.name]);
      }
    }
  } finally {
    await db.query('SET SESSION FOREIGN_KEY_CHECKS = 1');
  }
}

async function deployMigrations(url, resumeInstall, prisma) {
  const address = new URL(url);
  const db = await mysql.createConnection({
    host: address.hostname.replace(/^\[|\]$/g, ''), port: Number(address.port || 3306),
    user: decodeURIComponent(address.username), password: decodeURIComponent(address.password),
    database: decodeURIComponent(address.pathname.slice(1)), connectTimeout: 5000,
  });
  let work;
  let locked = false;
  try {
    const [[lock]] = await db.query("SELECT GET_LOCK(SHA2(CONCAT('epay-install:', DATABASE()), 256), 60) AS acquired");
    if (lock.acquired !== 1) throw new Error('数据库正在初始化，请稍后再试。');
    locked = true;
    const [[{ version }]] = await db.query('SELECT VERSION() AS version');
    const legacy = /^5\.7\./.test(version);
    const [tables] = await db.query('SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
    let history = [];
    if (tables.some(t => t.name === '_prisma_migrations')) {
      [history] = await db.query('SELECT migration_name, checksum, logs, rolled_back_at, finished_at FROM _prisma_migrations WHERE migration_name IN (?, ?) ORDER BY started_at', [baseline, strategy]);
    }
    const repairs = history.filter(knownFailure);
    if (!legacy && !repairs.length) return await prisma(['migrate', 'deploy']);
    work = mkdtempSync(join(tmpdir(), 'epay-prisma-'));
    const schema = join(work, 'schema.prisma');
    copyFileSync(join(__dirname, 'schema.prisma'), schema);
    cpSync(join(__dirname, 'migrations'), join(work, 'migrations'), { recursive: true });
    if (legacy) mysql57Scripts(work);
    // Prisma 保留原失败记录；后续部署从同一记录重建当时实际执行的迁移文件。
    for (const name of new Set(repairs.map(r => r.migration_name))) {
      const row = repairs.filter(r => r.migration_name === name).at(-1);
      const path = file(work, name);
      const sql = readFileSync(path, 'utf8');
      const marker = name === baseline ? 'CREATE TABLE `epay_sync_run`' : 'ALTER TABLE `strategy_group` ADD CONSTRAINT `strategy_group_template_id_fkey`';
      const firstStatement = name === baseline && /query number 1\b/.test(row.logs);
      const start = firstStatement ? 0 : sql.indexOf(marker);
      if (start < 0) throw new Error('安装迁移文件与失败记录不匹配。');
      const done = history.find(r => r.migration_name === name && r.finished_at);
      if (done) {
        if (done.checksum === digest(sql.slice(start))) writeFileSync(path, sql.slice(start));
        continue;
      }
      if (!resumeInstall) continue;
      const names = new Set(tables.map(t => t.name));
      if (firstStatement ? names.has('sys_user') : !names.has('strategy_group') || (name === baseline && names.has('epay_sync_run')) || (name === strategy && !names.has('strategy_template'))) {
        throw new Error('数据库结构与安装中断位置不一致，已保留现有数据。');
      }
      writeFileSync(path, sql.slice(start));
      if (!row.rolled_back_at) {
        await alignPartialSchema(db, tables, name);
        await prisma(['migrate', 'resolve', '--rolled-back', name, '--schema', schema]);
      }
    }
    await prisma(['migrate', 'deploy', '--schema', schema]);
  } finally {
    try {
      if (locked) await db.query("SELECT RELEASE_LOCK(SHA2(CONCAT('epay-install:', DATABASE()), 256))");
    } finally {
      db.destroy();
      if (work) rmSync(work, { recursive: true, force: true });
    }
  }
}

module.exports = { deployMigrations };
