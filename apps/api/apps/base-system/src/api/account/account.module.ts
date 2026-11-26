import { Module } from '@nestjs/common';

import { AccountController } from './account.controller';
import { NotificationModule } from '../notification/notification.module';
import { AccountService } from './account.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { ScriptBundleService } from './script-bundle.service';
import { ScriptRuntimeController } from './script-runtime.controller';

@Module({
  imports: [NotificationModule],
  controllers: [AccountController, ScriptRuntimeController],
  providers: [AccountService, AgentRuntimeService, ScriptBundleService],
  exports: [AccountService],
})
export class AccountModule {}
