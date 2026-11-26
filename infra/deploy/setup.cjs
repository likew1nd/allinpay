const { spawn } = require('node:child_process');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { existsSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { isIP } = require('node:net');
const { join } = require('node:path');
const { domainToASCII } = require('node:url');
const mysql = require('mysql2/promise');
const { deployMigrations } = require('./prisma/install-migrations.cjs');

const setupPath = '/v1/install';
const healthPath = '/v1/route/getConstantRoutes';
const directory = process.env.EPAY_SETUP_DIR;
const installedFile = join(directory, 'installed.json');
const pendingFile = join(directory, 'pending.json');

function readState(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

function writeState(file, value) {
  const temporary = file + '.tmp';
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, file);
}

function runNode(args, env, failure) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(failure)));
  });
}

function migrate(env, resumeInstall = false) {
  return deployMigrations(env.DATABASE_URL, resumeInstall, args =>
    runNode(['node_modules/prisma/build/index.js', ...args], env, '数据库迁移失败。具体错误已写入 API 容器日志。'));
}

function validate(input) {
  const { host, database, username, password, adminUsername, adminPassword } = input ?? {};
  const port = Number(input?.port);
  const text = value => typeof value === 'string';
  const suppliedHost = text(host) ? host.trim().replace(/^\[(.*)\]$/, '$1') : '';
  const mysqlHost = isIP(suppliedHost) ? suppliedHost :
    /^[\p{L}\p{N}.-]+$/u.test(suppliedHost) ? domainToASCII(suppliedHost) : '';
  if (!mysqlHost || (!isIP(mysqlHost) && !/^[a-z0-9][a-z0-9.-]*$/i.test(mysqlHost)) ||
      !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('请输入有效的 MySQL 主机和端口。');
  }
  if (!text(database) || !/^[\p{L}\p{N}_-]{1,64}$/u.test(database) ||
      !text(username) || !username.trim() || !text(password)) {
    throw new Error('请填写 MySQL 数据库名、用户名和密码。');
  }
  if (!text(adminUsername) || !/^[a-z0-9_.-]{1,64}$/i.test(adminUsername) ||
      !text(adminPassword) || adminPassword.trim().length < 6 || Buffer.byteLength(adminPassword.trim()) > 72 ||
      adminPassword.trim() === '123456') {
    throw new Error('请填写有效的管理员用户名，并设置至少 6 个字符的自定义密码。');
  }
  return { host: mysqlHost, port, database, username, password, adminUsername, adminPassword: adminPassword.trim() };
}

async function install(input) {
  const { host, port, database, username, password, adminUsername, adminPassword } = validate(input);
  const target = JSON.stringify([host.toLowerCase(), port, database]);
  const pending = readState(pendingFile);
  const resuming = pending?.target === target;
  let connection;
  try {
    connection = await mysql.createConnection({ host, port, user: username, password, connectTimeout: 5000 });
    const [schemata] = await connection.execute('SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
    if (!schemata.length) {
      await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    }
    const [tables] = await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? LIMIT 1', [database]);
    if (tables.length && !resuming) throw new Error('请选择一个专用空数据库，安装程序只初始化该库。');
    if (!tables.length && schemata.length && schemata[0].DEFAULT_COLLATION_NAME !== 'utf8mb4_unicode_ci') {
      await connection.query('ALTER DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    }
  } catch (error) {
    if (!error.code) throw error;
    const messages = {
      ER_ACCESS_DENIED_ERROR: 'MySQL 登录失败。请检查用户名、密码和容器来源授权。',
      ER_DBACCESS_DENIED_ERROR: '数据库访问失败。请创建专用数据库，并授权该 MySQL 用户。',
    };
    throw new Error(messages[error.code] || 'MySQL 连接或数据库检查失败。请检查地址、端口和数据库权限。');
  } finally {
    connection?.destroy();
  }

  const authority = isIP(host) === 6 ? '[' + host + ']' : host;
  const url = 'mysql://' + encodeURIComponent(username) + ':' + encodeURIComponent(password) + '@' +
    authority + ':' + port + '/' + encodeURIComponent(database);
  const env = {
    JWT_SECRET: randomBytes(32).toString('hex'),
    REFRESH_TOKEN_SECRET: randomBytes(32).toString('hex'),
    SITE_CREDENTIALS_KEY: randomBytes(32).toString('base64'),
    ...(resuming ? pending.env : {}),
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
  };
  writeState(pendingFile, { target, env });
  await migrate(env, resuming);
  await runNode(['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'prisma/seeds/index.ts'], {
    ...env, INITIAL_ADMIN_USERNAME: adminUsername, INITIAL_ADMIN_PASSWORD: adminPassword,
  }, '管理员初始化失败。请检查 API 容器日志后重试。');
  renameSync(pendingFile, installedFile);
  return env;
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readInput(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16384) throw new Error('安装参数过长。');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('安装参数格式无效。');
  }
}

async function serveInstaller() {
  const token = 'Bearer ' + randomBytes(24).toString('base64url');
  const expected = Buffer.from(token);
  const page = readFileSync(join(__dirname, 'setup.html'));
  let installing = false;

  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      const path = request.url?.split('?')[0];
      if (request.method === 'GET' && path === healthPath) return json(response, 403, { setup: true });
      if (request.method === 'GET' && path === setupPath) {
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'",
        });
        response.end(page);
        return;
      }
      if (request.method !== 'POST' || path !== setupPath) return json(response, 503, { message: '中心尚未完成安装。' });
      const supplied = Buffer.from(request.headers.authorization ?? '');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return json(response, 401, { message: '安装码错误。请查看 API 容器的最新安装日志。' });
      }
      if (installing) return json(response, 409, { message: '中心正在初始化，请稍候。' });
      installing = true;
      try {
        const env = await install(await readInput(request));
        json(response, 200, { installed: true });
        server.close(error => error ? reject(error) : resolve(env));
      } catch (error) {
        installing = false;
        json(response, 400, { message: error.code ? '无法保存安装配置，请检查 API 容器日志。' : error.message });
        if (error.code) console.error('[安装] 无法保存配置：', error.code);
      }
    });
    server.once('error', reject);
    server.listen(Number(process.env.APP_PORT ?? 9528), '0.0.0.0', () => {
      console.log('[安装] 请打开网站首页，填写一次性安装码：' + token.slice(7));
    });
  });
}

async function main() {
  process.env.REDIS_PASSWORD = readFileSync(process.env.EPAY_REDIS_PASSWORD_FILE, 'utf8');
  const installed = readState(installedFile);
  const env = installed ? installed.env : await serveInstaller();
  if (installed) await migrate(env);
  Object.assign(process.env, env);
  require('./dist/apps/base-system/src/main.js');
}

main().catch(error => {
  console.error('[启动]', error.message);
  process.exitCode = 1;
});
