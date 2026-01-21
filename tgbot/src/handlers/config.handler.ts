import { Context } from 'grammy';
import { WGDashboardService } from '../services/wgdashboard.service';
import { ServiceManagerClient } from '../services/manager.service';
import { QRCodeGenerator } from '../utils/qrcode';
import { AuthService } from '../services/auth.service';
import logger from '../utils/logger';
import { InputFile } from 'grammy';

export class ConfigHandler {
  constructor(
    private wgService: WGDashboardService,
    private managerService: ServiceManagerClient,
    private qrGenerator: QRCodeGenerator,
    private authService: AuthService
  ) {}

  async handleGetConfig(ctx: Context) {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || ctx.from?.first_name || 'User';
    
    if (!userId) {
      await ctx.reply('❌ Не удалось определить ваш ID.');
      return;
    }

    logger.info('Config request received', { userId, username });

    // Проверка доступа
    if (!this.authService.canGetConfig(userId)) {
      const authMode = this.authService['authMode'];
      
      let message = '🔒 <b>Доступ ограничен</b>\n\n';
      
      if (authMode === 'admin_approval') {
        const request = this.authService.getAccessRequest(userId);
        
        if (request?.status === 'pending') {
          message += 'Ваш запрос на рассмотрении.\nПожалуйста, дождитесь одобрения администратора.';
        } else if (request?.status === 'rejected') {
          message += 'Ваш запрос был отклонен.\nСвяжитесь с администратором для получения доступа.';
        } else {
          message += 'Для получения доступа отправьте запрос:\n/request_access';
        }
      } else if (authMode === 'whitelist') {
        message += 'У вас нет доступа к этой функции.\nСвяжитесь с администратором.';
      } else if (authMode === 'closed') {
        message += 'Эта функция доступна только администраторам.';
      }
      
      await ctx.reply(message, { parse_mode: 'HTML' });
      logger.info('Config request denied - no access', { userId, authMode });
      return;
    }

    try {
      // Отправляем сообщение о создании конфигурации
      const statusMsg = await ctx.reply('⏳ Создаю вашу конфигурацию...');

      // Создаем нового пира
      const peerName = `TG_${username}_${Date.now()}`;
      const peer = await this.wgService.addPeer({ name: peerName });

      if (!peer) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          '❌ Ошибка при создании конфигурации. Попробуйте позже.'
        );
        return;
      }

      if (!peer.id) {
        logger.error('Peer created but missing id', { name: peerName, peer });
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          '❌ Ошибка при создании конфигурации (peerId отсутствует). Попробуйте позже.'
        );
        return;
      }

      logger.info('Peer created', { peerId: peer.id, name: peerName });

      // Получаем конфигурацию
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        '⏳ Генерирую файл конфигурации...'
      );

      const configFromPeer = typeof peer.config === 'string' ? peer.config : null;
      const config = configFromPeer && configFromPeer.includes('[Interface]')
        ? configFromPeer
        : await this.wgService.downloadPeerConfig(peer.id);
      
      if (!config) {
        logger.error('Failed to download peer config', { peerId: peer.id, name: peerName });
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          '❌ Не удалось получить конфигурацию. Попробуйте позже.'
        );
        return;
      }

      // Создаем share link
      const shareLink = await this.managerService.createShareLink(peer.id, {
        expiryHours: 24,
        maxUsage: 3,
        config: config // Pass the actual config content
      });

      // Генерируем QR код
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        '⏳ Генерирую QR-код...'
      );

      const qrBuffer = await this.qrGenerator.generateQRCode(config);

      // Удаляем статусное сообщение
      await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id);

      // Отправляем конфигурацию
      const successMessage = `
✅ <b>Конфигурация создана успешно!</b>

<b>Имя:</b> <code>${peerName}</code>
<b>ID:</b> <code>${peer.id}</code>

<b>Способы подключения:</b>
1️⃣ Отсканируйте QR-код ниже в приложении WireGuard
2️⃣ Импортируйте файл конфигурации
${shareLink ? `3️⃣ Скачайте по ссылке (действует 24 часа):\n${shareLink.url}` : ''}

<i>⚠️ Сохраните эту конфигурацию в безопасном месте!</i>
      `.trim();

      await ctx.reply(successMessage, { parse_mode: 'HTML' });

      // Отправляем QR код
      if (qrBuffer) {
        await ctx.replyWithPhoto(new InputFile(qrBuffer, 'wireguard-qr.png'), {
          caption: '📱 QR-код для быстрого подключения'
        });
      }

      // Отправляем файл конфигурации
      const configBuffer = Buffer.from(config, 'utf-8');
      await ctx.replyWithDocument(
        new InputFile(configBuffer, `${peerName}.conf`),
        {
          caption: '📄 Файл конфигурации WireGuard'
        }
      );

      logger.info('Configuration sent successfully', { 
        userId, 
        peerId: peer.id,
        hasShareLink: !!shareLink 
      });

    } catch (error: any) {
      logger.error('Error handling config request', { 
        error: error.message,
        userId 
      });
      
      await ctx.reply(
        '❌ Произошла ошибка при создании конфигурации. Пожалуйста, попробуйте позже или свяжитесь с администратором.',
        { parse_mode: 'HTML' }
      );
    }
  }
}
