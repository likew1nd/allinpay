#!/usr/bin/env node
'use strict';

const { fork, execSync } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

const VERSION_FILE = path.join(DIST, 'script-version.txt');
const MANIFEST_FILE = path.join(DIST, 'script-manifest.json');
const RUNTIME_FILES = ['main.js', 'runner.js', 'central.js', 'adspower.js', 'cdp.js', 'contracts.js',
  'agent-client.js', 'agent-runtime.js', 'outbox.js'];
const BROWSER_FILES = ['adspower-browser.js', 'adspower-request.js', 'monitoring-log.js',
  'app-id-parser.js', 'alipay-session.js', 'login-flow.js', 'captcha-handler.js', 'captcha-solver.js', 'transfer.js', 'post-login-inspection.js'];
const RESTART_DELAY_MS = 3000;

// 读取必要的环境变量
const CENTRAL_API_URL = process.env.CENTRAL_API_URL?.trim().replace(/\/+$/, '');
const CENTRAL_API_BASE = CENTRAL_API_URL?.endsWith('/v1') ? CENTRAL_API_URL : `${CENTRAL_API_URL}/v1`;
const COLLECTOR_ID = process.env.COLLECTOR_ID;
const COLLECTOR_TOKEN = process.env.COLLECTOR_TOKEN;

/**
 * 发起 HTTP/HTTPS GET 请求，携带采集端 Token 鉴权。
 * 返回 { statusCode, headers, body: Buffer }
 */
function httpGet(url, extraHeaders) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'x-collector-token': COLLECTOR_TOKEN,
        ...extraHeaders,
      },
    };
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      );
    });
    req.setTimeout(60_000, () => req.destroy(new Error('中心请求超时')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * 读取本地已缓存的版本号，文件不存在时返回空字符串。
 */
function readLocalVersion() {
  try {
    return fs.readFileSync(VERSION_FILE, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

/**
 * 计算 Buffer 的 SHA-256 十六进制摘要。
 */
function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// 防止版本标记与实际业务文件不一致。
function verifyRuntime(version, directory = DIST) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'script-manifest.json'), 'utf8'));
    const entries = Object.entries(manifest.files ?? {});
    return manifest.version === version &&
      RUNTIME_FILES.every(name => manifest.files?.[name]) &&
      BROWSER_FILES.every(name => manifest.files?.['browser/' + name]) &&
      manifest.files?.['launcher.cjs'] && // 启动器自身也需要校验
      entries.length > 0 &&
      entries.every(([name, expected]) => /^[A-Za-z0-9_@./+-]+$/.test(name) && !name.startsWith('/') &&
        name.split('/').every(part => part && part !== '..' && part !== '.') &&
        typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected) &&
        sha256Hex(fs.readFileSync(path.join(directory, name))) === expected);
  } catch (_) {
    return false;
  }
}

/**
 * 将 zip Buffer 写到临时文件，然后用 PowerShell Expand-Archive 解压到目标目录。
 */
function extractZip(zipBuf, destDir) {
  const tmpFile = path.join(os.tmpdir(), `launcher-bundle-${Date.now()}.zip`);
  fs.writeFileSync(tmpFile, zipBuf);
  try {
    // PowerShell 内置，Windows 7+ 均可用；-Force 会覆盖已有文件
    execSync(
      `powershell -NonInteractive -Command "Expand-Archive -LiteralPath '${tmpFile}' -DestinationPath '${destDir}' -Force"`,
      { stdio: 'pipe' }
    );
  } finally {
    // 清理临时 zip，失败也不影响流程
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

/** 将下载绑定到一次发布。切换窗口内重新读取版本，最多尝试三次。 */
async function downloadUpdate(base, request = httpGet) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 250));
    const response = await request(base + '/script-version');
    if (response.statusCode !== 200) throw new Error(`版本接口返回 ${response.statusCode}`);
    const json = JSON.parse(response.body.toString('utf8'));
    const { version, bundleHash } = json.data ?? json;
    if (version === '0.0.0' && !bundleHash) return null;
    if (!version || typeof bundleHash !== 'string' || !/^[a-f0-9]{64}$/.test(bundleHash))
      throw new Error('中心返回的版本或 SHA-256 无效');
    if (readLocalVersion() === version && verifyRuntime(version)) return null;

    const url = `${base}/script-bundle?version=${encodeURIComponent(version)}&hash=${bundleHash}`;
    const res = await request(url);
    if (res.statusCode === 200 && sha256Hex(res.body) === bundleHash) return { version, buffer: res.body };
    if (res.statusCode !== 200 && res.statusCode !== 409 && res.statusCode !== 503)
      throw new Error(`下载接口返回 ${res.statusCode}`);
  }
  throw new Error('未获得与发布元数据匹配的脚本包');
}

async function checkAndUpdate() {
  console.log('[launcher] 检查脚本版本...');
  let stage;
  try {
    const update = await downloadUpdate(`${CENTRAL_API_BASE}/collectors/${encodeURIComponent(COLLECTOR_ID)}`);
    if (!update) return;
    const { version: remoteVersion, buffer: zipBuf } = update;
    // 确保目标目录存在
    stage = fs.mkdtempSync(path.join(ROOT, '.agent-update-'));
    const candidate = path.join(stage, 'runtime');
    const previous = path.join(stage, 'previous');
    fs.mkdirSync(candidate);
    extractZip(zipBuf, candidate);
    if (!verifyRuntime(remoteVersion, candidate)) throw new Error('运行文件校验失败');
    fs.writeFileSync(path.join(candidate, 'script-version.txt'), remoteVersion, 'utf8');
    const hadPrevious = fs.existsSync(DIST);
    if (hadPrevious) fs.renameSync(DIST, previous);
    try {
      fs.renameSync(candidate, DIST);
      // 更新根目录的启动器（支持启动器自身的热更新）
      const newLauncher = path.join(DIST, 'launcher.cjs');
      const rootLauncher = path.join(ROOT, 'launcher.cjs');
      if (fs.existsSync(newLauncher)) {
        fs.copyFileSync(newLauncher, rootLauncher);
      }
    }
    catch (error) { if (hadPrevious) fs.renameSync(previous, DIST); throw error; }

    console.log(`[launcher] 更新完成，当前版本: ${remoteVersion}`);
  } catch (err) {
    console.error('[launcher] 更新失败，继续使用旧版本:', err.message);
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
  }
}

/**
 * fork dist/main.js 并守护它：
 * - 转发 SIGINT / SIGTERM 给子进程
 * - 子进程退出后等待 RESTART_DELAY_MS 毫秒后重启（无限循环）
 */
let shuttingDown = false;
let child;

function startChild() {
  const mainJs = path.join(DIST, 'main.js');

  if (!fs.existsSync(mainJs)) {
    console.error(`[launcher] 找不到业务入口: ${mainJs}，请先构建项目`);
    process.exit(1);
  }

  console.log(`[launcher] 启动业务进程: ${mainJs}`);

  child = fork(mainJs, [], {
    cwd: ROOT,
    // 继承父进程环境变量，子进程可直接读取
    env: { ...process.env, EPAY_LAUNCHER_PROTOCOL: '2' },
    // 使用独立的 stdio 流，父子进程日志各自输出
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    child = undefined;
    if (shuttingDown || signal || code === 0) { process.exitCode = code ?? 0; return; }
    console.log(
      `[launcher] 业务进程退出 (code=${code}, signal=${signal})，${RESTART_DELAY_MS / 1000} 秒后重启...`
    );
    setTimeout(async () => {
      if (shuttingDown) return;
      if (code === 75) await checkAndUpdate();
      if (!shuttingDown) startChild();
    }, RESTART_DELAY_MS);
  });

  child.on('error', (err) => {
    console.error('[launcher] 业务进程启动错误:', err.message);
  });
}

/**
 * 入口：先检查并按需更新脚本，再启动业务进程守护循环。
 */
async function main() {
  if (!CENTRAL_API_URL || !COLLECTOR_ID || !COLLECTOR_TOKEN) throw new Error('缺少中心地址或采集端凭据');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    shuttingDown = true;
    if (child && !child.killed) child.kill(signal);
  });
  await checkAndUpdate();
  startChild();
}

if (require.main === module) main().catch((err) => {
  console.error('[launcher] 未预期的启动错误:', err);
  process.exit(1);
});

module.exports = { downloadUpdate };
