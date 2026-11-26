import { Module } from '@nestjs/common';

import { AccountModule } from '../account';

import { PayeeService } from './payee.service';
import { TransferController } from './transfer.controller';
import { TransferRuleService } from './transfer-rule.service';
import { TransferService } from './transfer.service';

@Module({
  imports: [AccountModule],
  controllers: [TransferController],
  providers: [PayeeService, TransferRuleService, TransferService],
  exports: [TransferService],
})
export class TransferModule {}
