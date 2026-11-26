import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const directory = join(process.cwd(), 'script-bundles', process.env.DEPLOY_STATE ? 'current' : '');
const versionFile = join(directory, 'version.json');
const bundleFile = join(directory, 'bundle.zip');

export interface ScriptVersion {
  version: string;
  bundleHash: string;
  releasedAt: string;
}

@Injectable()
export class ScriptBundleService {
  async getVersion(): Promise<ScriptVersion> {
    try {
      const [raw, file] = await Promise.all([readFile(versionFile, 'utf8'), stat(bundleFile)]);
      const meta = JSON.parse(raw.replace(/^\uFEFF/, ''));
      if (file.isFile() && typeof meta?.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(meta.version) &&
        typeof meta.bundleHash === 'string' && /^[a-f0-9]{64}$/i.test(meta.bundleHash)) {
        return { version: meta.version, bundleHash: meta.bundleHash.toLowerCase(),
          releasedAt: typeof meta.releasedAt === 'string' ? meta.releasedAt : new Date(0).toISOString() };
      }
    } catch {
      // 尚未发布、文件不完整或元数据无效时，客户端继续使用本机版本。
    }
    return { version: '0.0.0', bundleHash: '', releasedAt: new Date(0).toISOString() };
  }

  async getBundle(expectedVersion?: string, expectedHash?: string) {
    const meta = await this.getVersion();
    if (!meta.bundleHash) throw new NotFoundException('脚本包尚未发布');
    if ((expectedVersion !== undefined && expectedVersion !== meta.version) ||
        (expectedHash !== undefined && expectedHash !== meta.bundleHash)) {
      throw new ConflictException('发布版本已切换，请重新查询版本');
    }

    let buffer: Buffer;
    try { buffer = await readFile(bundleFile); }
    catch { throw new NotFoundException('脚本包尚未发布'); }
    const hash = createHash('sha256').update(buffer).digest('hex');
    // 本机发布先换 ZIP 再换元数据，部署中心则原子切换目录。只发送与本次元数据匹配的字节。
    if (hash !== meta.bundleHash) throw new ServiceUnavailableException('脚本包与发布元数据尚未匹配，请稍后重试');
    return { buffer, hash, version: meta.version };
  }
}