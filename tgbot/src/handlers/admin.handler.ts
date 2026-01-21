import { Context } from 'grammy';
import { WGDashboardService } from '../services/wgdashboard.service';
import logger from '../utils/logger';

export class AdminHandler {
  constructor(
    private wgService: WGDashboardService,
    private adminIds: number[]
  ) {}

  isAdmin(userId?: number): boolean {
    return userId ? this.adminIds.includes(userId) : false;
  }

  async handleStats(ctx: Context) {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    try {
      const peers = await this.wgService.getPeers();
      
      const activePeers = peers.filter((p: any) => !p.restricted);
      const restrictedPeers = peers.filter((p: any) => p.restricted);
      
      const statsMessage = `
📊 <b>Статистика системы</b>

<b>Пиры:</b>
• Всего: ${peers.length}
• Активных: ${activePeers.length}
• Заблокированных: ${restrictedPeers.length}

<b>Последние 5 пиров:</b>
${peers.slice(-5).map((p: any, i: number) => 
  `${i + 1}. ${p.name} (${p.id.slice(0, 8)}...)`
).join('\n')}
      `.trim();

      await ctx.reply(statsMessage, { parse_mode: 'HTML' });
      
      logger.info('Stats command executed', { adminId: ctx.from?.id });
    } catch (error: any) {
      logger.error('Error fetching stats', { error: error.message });
      await ctx.reply('❌ Ошибка при получении статистики.');
    }
  }

  async handleListPeers(ctx: Context) {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    try {
      const peers = await this.wgService.getPeers();
      
      if (peers.length === 0) {
        await ctx.reply('📝 Нет созданных пиров.');
        return;
      }

      const peersList = peers.map((p: any, i: number) => {
        const status = p.restricted ? '🔴' : '🟢';
        const lastHandshake = p.latest_handshake 
          ? new Date(p.latest_handshake * 1000).toLocaleString('ru-RU')
          : 'Нет';
        
        return `${i + 1}. ${status} <b>${p.name}</b>
   ID: <code>${p.id}</code>
   IP: ${p.allowed_ips?.[0] || 'N/A'}
   Последнее подключение: ${lastHandshake}`;
      }).join('\n\n');

      const message = `<b>📋 Список пиров (${peers.length}):</b>\n\n${peersList}`;
      
      // Разбиваем сообщение на части, если оно слишком длинное
      if (message.length > 4000) {
        const chunks = this.splitMessage(message, 4000);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: 'HTML' });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'HTML' });
      }

      logger.info('List peers command executed', { 
        adminId: ctx.from?.id,
        peerCount: peers.length 
      });
    } catch (error: any) {
      logger.error('Error listing peers', { error: error.message });
      await ctx.reply('❌ Ошибка при получении списка пиров.');
    }
  }

  async handleDeletePeer(ctx: Context) {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    const args = ctx.message?.text?.split(' ').slice(1);
    
    if (!args || args.length === 0) {
      await ctx.reply(
        'Использование: /delete <peer_id>\n\nПример: /delete abc123def456'
      );
      return;
    }

    const peerId = args[0];

    try {
      const peer = await this.wgService.getPeerById(peerId);
      
      if (!peer) {
        await ctx.reply('❌ Пир с таким ID не найден.');
        return;
      }

      const success = await this.wgService.deletePeer(peerId);
      
      if (success) {
        await ctx.reply(
          `✅ Пир <b>${peer.name}</b> успешно удален.`,
          { parse_mode: 'HTML' }
        );
        logger.info('Peer deleted', { peerId, adminId: ctx.from?.id });
      } else {
        await ctx.reply('❌ Не удалось удалить пир.');
      }
    } catch (error: any) {
      logger.error('Error deleting peer', { error: error.message, peerId });
      await ctx.reply('❌ Ошибка при удалении пира.');
    }
  }

  async handleRestrictPeer(ctx: Context) {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    const args = ctx.message?.text?.split(' ').slice(1);
    
    if (!args || args.length < 2) {
      await ctx.reply(
        'Использование: /restrict <peer_id> <true|false>\n\n' +
        'Пример: /restrict abc123def456 true'
      );
      return;
    }

    const peerId = args[0];
    const restrict = args[1].toLowerCase() === 'true';

    try {
      const peer = await this.wgService.getPeerById(peerId);
      
      if (!peer) {
        await ctx.reply('❌ Пир с таким ID не найден.');
        return;
      }

      const success = await this.wgService.restrictPeer(peerId, restrict);
      
      if (success) {
        const action = restrict ? 'заблокирован' : 'разблокирован';
        await ctx.reply(
          `✅ Пир <b>${peer.name}</b> ${action}.`,
          { parse_mode: 'HTML' }
        );
        logger.info('Peer restriction changed', { 
          peerId, 
          restrict, 
          adminId: ctx.from?.id 
        });
      } else {
        await ctx.reply('❌ Не удалось изменить статус пира.');
      }
    } catch (error: any) {
      logger.error('Error restricting peer', { error: error.message, peerId });
      await ctx.reply('❌ Ошибка при изменении статуса пира.');
    }
  }

  async handleAdminHelp(ctx: Context) {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    const helpMessage = `
<b>🔐 Команды администратора</b>

<b>Просмотр информации:</b>
/stats - Статистика системы
/list - Список всех пиров

<b>Управление пирами:</b>
/delete &lt;peer_id&gt; - Удалить пир
/restrict &lt;peer_id&gt; &lt;true|false&gt; - Заблокировать/разблокировать пир

<b>Управление доступом:</b>
/authstats - Статистика авторизации
/pending - Запросы на рассмотрении
/approved - Список одобренных пользователей
/approve_&lt;user_id&gt; - Одобрить пользователя
/reject_&lt;user_id&gt; - Отклонить запрос
/revoke_&lt;user_id&gt; - Отозвать доступ

<b>Примеры:</b>
<code>/delete abc123def456</code>
<code>/restrict abc123def456 true</code>
<code>/approve_123456789</code>
    `.trim();

    await ctx.reply(helpMessage, { parse_mode: 'HTML' });
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let current = '';
    
    const lines = text.split('\n');
    
    for (const line of lines) {
      if ((current + line + '\n').length > maxLength) {
        chunks.push(current);
        current = line + '\n';
      } else {
        current += line + '\n';
      }
    }
    
    if (current) {
      chunks.push(current);
    }
    
    return chunks;
  }
}
