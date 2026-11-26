import { ReleaseController } from './release.controller';
import { Module } from '@nestjs/common';

import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { SystemSettingService } from './system-setting.service';

@Module({
  controllers: [MfaController, ReleaseController],
  providers: [SystemSettingService, MfaService],
  exports: [SystemSettingService, MfaService],
})
export class SystemSettingModule {}
