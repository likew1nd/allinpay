import { Injectable } from '@nestjs/common';
import { Api } from 'grammy';
import { decryptSiteSecret } from '../site/site-credentials';

@Injectable()
export class TelegramTransportService {
  fromToken(token: string) { return new Api(token, { timeoutSeconds: 15 }); }
  fromEncrypted(encrypted: string) { return this.fromToken(decryptSiteSecret('telegram-default', 'telegram-bot-token', encrypted)); }
}
