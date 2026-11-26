import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ReleaseRegion = 'cn' | 'global';

function regionFile(versionFile: string) {
  return resolve(dirname(versionFile), '../../.runtime/release-region');
}

export async function localReleaseRegion(versionFile: string): Promise<ReleaseRegion> {
  try {
    return (await readFile(regionFile(versionFile), 'utf8')).trim() === 'cn' ? 'cn' : 'global';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'global';
    throw error;
  }
}

export async function saveLocalReleaseRegion(versionFile: string, region: ReleaseRegion) {
  const path = regionFile(versionFile);
  await mkdir(dirname(path), { recursive: true });
  const pending = path + '.' + randomUUID();
  try {
    await writeFile(pending, region, { flag: 'wx' });
    await rename(pending, path);
  } finally {
    await rm(pending, { force: true });
  }
}

type PublishedCenter = { version: string; html_url: string; published_at: string };
type ReleaseListItem = { draft: boolean; prerelease: boolean; tag_name: string; published_at: string };
const repository = 'likew1nd/allinpay';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export class SourceReleaseCatalog {
  constructor(private readonly region: ReleaseRegion = 'global') {}

  private latest?: PublishedCenter;
  private checked?: string;
  private checkError = '';
  private nextCheck = 0;
  private baseline?: string;
  private checking?: Promise<void>;

  private async refresh() {
    try {
      let newest: PublishedCenter | undefined;
      for (let page = 1; ; page += 1) {
        const url = `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`;
        const endpoint = this.region === 'cn' ? 'https://git.5588.la/' + url : url;
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'epay-center' } });
        if (!response.ok) throw new Error(String(response.status));
        const rows = await response.json() as ReleaseListItem[];
        for (const row of rows) {
          if (row.draft || row.prerelease || !row.tag_name.startsWith('center-v')) continue;
          const version = row.tag_name.slice(8);
          if (semver.test(version) && (!newest || version.localeCompare(newest.version, 'en', { numeric: true }) > 0)) {
            newest = { version, html_url: `https://github.com/${repository}/releases/tag/${row.tag_name}`, published_at: row.published_at };
          }
        }
        if (rows.length < 100) break;
      }
      this.latest = newest;
      this.checked = new Date().toISOString();
      this.checkError = '';
      this.nextCheck = Date.now() + 30 * 60_000;
    } catch {
      this.checkError = '所选更新服务器的版本检查失败，请稍后重试。';
      this.nextCheck = Date.now() + 60_000;
    }
  }

  async status(versionFile: string, force = false) {
    const version = (await readFile(versionFile, 'utf8')).trim();
    if (!semver.test(version)) throw new Error('中心源码基线版本无效');
    if (force || this.baseline !== version || Date.now() >= this.nextCheck) {
      this.baseline = version;
      this.checking ??= this.refresh().finally(() => { this.checking = undefined; });
      await this.checking;
    }
    return { managed: false, source: true, region: this.region, current: version, checked: this.checked, checkError: this.checkError,
      available: this.latest ? { center: this.latest } : {} };
  }
}
