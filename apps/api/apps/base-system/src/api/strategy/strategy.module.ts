import { Module } from '@nestjs/common';

import { AccountModule } from '../account';
import { SiteModule } from '../site';

import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { TemplateStrategyService } from './template-strategy.service';

@Module({
  imports: [SiteModule, AccountModule],
  controllers: [StrategyController],
  providers: [StrategyService, TemplateStrategyService],
  exports: [StrategyService],
})
export class StrategyModule {}
