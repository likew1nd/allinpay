import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { NotificationModule } from '../notification/notification.module';
import { TelegramController, NotificationController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramTransportService } from './telegram-transport.service';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramCommandService } from './telegram-command.service';
import { TelegramDeliveryService } from './telegram-delivery.service';
import { TelegramRuntimeService } from './telegram-runtime.service';

@Module({ imports: [AccountModule, NotificationModule], controllers: [TelegramController, NotificationController],
  providers: [TelegramService, TelegramTransportService, TelegramAuthService, TelegramCommandService, TelegramDeliveryService, TelegramRuntimeService] })
export class TelegramModule {}
