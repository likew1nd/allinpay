import { Module } from '@nestjs/common';

import { SiteDataService } from './site-data.service';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';
import { SiteChannelService } from './site-channel.service';
import { SiteChannelController } from './site-channel.controller';

@Module({
  controllers: [SiteController, SiteChannelController],
  providers: [SiteService, SiteDataService, SiteChannelService],
  exports: [SiteService, SiteDataService, SiteChannelService],
})
export class SiteModule {}
