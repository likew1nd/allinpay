import { Module } from '@nestjs/common';

import { StrategyModule } from '../strategy';
import { SiteModule } from './index';
import { SiteConnectionService } from './site-connection.service';

@Module({
  imports: [SiteModule, StrategyModule],
  providers: [SiteConnectionService],
})
export class SiteConnectionModule {}
