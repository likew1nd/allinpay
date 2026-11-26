import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, ServiceUnavailableException, StreamableFile, UseGuards } from '@nestjs/common';
import { AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import { ApiRes } from '@lib/infra/rest/res.response';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localReleaseRegion, saveLocalReleaseRegion, SourceReleaseCatalog } from './source-release';

@UseGuards(AuthZGuard)
@Controller('releases')
export class ReleaseController {
  private readonly catalogs = { cn: new SourceReleaseCatalog('cn'), global: new SourceReleaseCatalog('global') };

  private async sourceStatus(file: string, force = false) {
    const region = await localReleaseRegion(file);
    return this.catalogs[region].status(file, force);
  }

  @Get()
  @UsePermissions({ resource: 'system-setting', action: 'read' })
  async status() {
    const root = process.env.DEPLOY_STATE;
    if (!root) {
      const file = process.env.EPAY_SOURCE_VERSION_FILE;
      return ApiRes.success(file ? await this.sourceStatus(file) : { managed: false });
    }
    return ApiRes.success(await this.managedStatus(root));
  }

  private async managedStatus(root: string) {
    const names = await readdir(join(root, 'requests')).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const pending = names.filter(name => /^region-\d{13}-\d{24}-(cn|global)$/.test(name)).sort().pop();
    const name = names.find(item => /^update-\d+\.\d+\.\d+$/.test(item));
    const entry = name ? await stat(join(root, 'requests', name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    }) : null;
    const upgrade = name && entry ? { version: name.slice(7), phase: entry.size ? 'running' : 'queued' } : null;
    const content = await readFile(join(root, 'state/release.json'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '{}';
      throw error;
    });
    const data = JSON.parse(content);
    return { managed: true, region: 'global', ...data, pendingRegion: pending?.split('-').pop(), upgrade };
  }

  @Get('agent')
  @UsePermissions({ resource: 'collector', action: 'read' })
  async agentStatus() {
    if (process.env.DEPLOY_STATE) return this.status();
    return ApiRes.success(await this.localAgentStatus());
  }

  private async localAgentStatus(force = false) {
    const file = process.env.EPAY_SOURCE_VERSION_FILE;
    const region = file ? await localReleaseRegion(file) : 'global';
    const installer = await readFile(join(process.cwd(), 'script-bundles/installers/version.txt'), 'utf8').catch(() => '');
    return { ...await this.catalogs[region].versions(force), agent: installer.trim() };
  }

  @Post('region')
  @UsePermissions({ resource: 'system-setting', action: 'update' })
  async setRegion(@Body() body: { region?: string }) {
    const region = body?.region;
    if (region !== 'cn' && region !== 'global') throw new BadRequestException('更新服务器无效');
    const root = process.env.DEPLOY_STATE;
    if (root) {
      const stamp = process.hrtime.bigint().toString().padStart(24, '0');
      await writeFile(join(root, 'requests', `region-${Date.now()}-${stamp}-${region}`), '', { flag: 'wx' });
      return ApiRes.success({ queued: true });
    }
    const file = process.env.EPAY_SOURCE_VERSION_FILE;
    if (!file) throw new ServiceUnavailableException('当前实例未启用更新检查');
    await saveLocalReleaseRegion(file, region);
    return ApiRes.success(await this.catalogs[region].status(file, true));
  }

  @Post('requests')
  @UsePermissions({ resource: 'system-setting', action: 'update' })
  async enqueue(@Body() body: { action?: string; version?: string; kind?: string }) {
    const root = process.env.DEPLOY_STATE;
    if (!root) {
      if (body?.action === 'check-update' && body.kind === 'agent') return ApiRes.success(await this.localAgentStatus(true));
      if (body?.action === 'check-update' && process.env.EPAY_SOURCE_VERSION_FILE) {
        return ApiRes.success(await this.sourceStatus(process.env.EPAY_SOURCE_VERSION_FILE, true));
      }
      throw new ServiceUnavailableException('本机源码通过开发流程更新');
    }
    const { action, version } = body ?? {};
    if (!['update', 'sync-agent', 'check-update'].includes(action ?? '')) throw new BadRequestException('无效的更新操作');
    if (action !== 'check-update' && (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))) {
      throw new BadRequestException('无效的发布版本');
    }
    const name = action === 'check-update' ? action : `${action}-${version}`;
    if (action === 'update') {
      const status = await this.managedStatus(root);
      if (status.upgrade) return ApiRes.success({ queued: true, upgrade: status.upgrade });
      if (version !== status.available?.center?.version || !status.current || version!.localeCompare(status.current, 'en', { numeric: true }) <= 0) {
        throw new ConflictException('可用版本已变化，请重新检查更新');
      }
    }
    try {
      await writeFile(join(root, 'requests', name), '', { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return ApiRes.success(action === 'update' ? { queued: true, upgrade: { version, phase: 'queued' } } : { queued: true });
  }

  @Get('installer/:kind')
  @UsePermissions({ resource: 'collector', action: 'read' })
  async installer(@Param('kind') kind: string) {
    if (!['full', 'repair'].includes(kind)) throw new NotFoundException();
    const filename = kind === 'full' ? 'windows-agent.zip' : 'windows-agent-repair.zip';
    const path = join(process.cwd(), process.env.DEPLOY_STATE ? 'script-bundles/current' : 'script-bundles/installers', filename);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException('本站尚未同步安装包');
    return new StreamableFile(createReadStream(path), { type: 'application/zip', disposition: `attachment; filename="${filename}"`, length: info.size });
  }
}
