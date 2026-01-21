import { Context } from 'grammy';
import { AuthService } from '../services/auth.service';
import logger from '../utils/logger';

export class AuthHandler {
  constructor(
    private authService: AuthService,
    private botUsername: string
  ) {}

  async handleRequestAccess(ctx: Context) {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const firstName = ctx.from?.first_name;
    const lastName = ctx.from?.last_name;

    if (!userId) {
      await ctx.reply('❌ Не удалось определить ваш ID.');
      return;
    }

    // Проверяем, может ли пользователь уже получать конфиги
    if (this.authService.canGetConfig(userId)) {
      await ctx.reply('✅ У вас уже есть доступ к получению конфигураций!');
      return;
    }

    try {
      const request = this.authService.requestAccess(userId, username, firstName, lastName);
      
      await ctx.reply(
        `📝 <b>Запрос на доступ отправлен</b>\n\n` +
        `Ваш запрос будет рассмотрен администратором.\n` +
        `Вы получите уведомление, когда решение будет принято.\n\n` +
        `<i>Время запроса: ${new Date(request.requestedAt).toLocaleString('ru-RU')}</i>`,
        { parse_mode: 'HTML' }
      );

      // Уведомляем админов
      await this.notifyAdminsAboutRequest(ctx, request);

      logger.info('Access requested', { userId, username });
    } catch (error: any) {
      if (error.message === 'User already approved') {
        await ctx.reply('✅ У вас уже есть доступ!');
      } else if (error.message === 'Access request already pending') {
        await ctx.reply(
          '⏳ Ваш запрос уже на рассмотрении.\n\n' +
          'Пожалуйста, дождитесь решения администратора.'
        );
      } else {
        logger.error('Error in request access', { error: error.message, userId });
        await ctx.reply('❌ Произошла ошибка при отправке запроса. Попробуйте позже.');
      }
    }
  }

  async handlePendingRequests(ctx: Context) {
    if (!this.authService.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    try {
      const requests = this.authService.getPendingRequests();

      if (requests.length === 0) {
        await ctx.reply('📋 Нет запросов на рассмотрении.');
        return;
      }

      let message = `<b>📋 Запросы на доступ (${requests.length}):</b>\n\n`;

      for (const request of requests) {
        const userInfo = [
          request.firstName,
          request.lastName,
          request.username ? `@${request.username}` : null
        ].filter(Boolean).join(' ');

        const date = new Date(request.requestedAt).toLocaleString('ru-RU');

        message += `👤 <b>${userInfo}</b>\n`;
        message += `   ID: <code>${request.userId}</code>\n`;
        message += `   Дата: ${date}\n`;
        message += `   Команды:\n`;
        message += `   /approve_${request.userId} - одобрить\n`;
        message += `   /reject_${request.userId} - отклонить\n\n`;
      }

      // Разбиваем на части, если слишком длинное
      if (message.length > 4000) {
        const chunks = this.splitMessage(message, 4000);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: 'HTML' });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'HTML' });
      }

      logger.info('Pending requests viewed', { adminId: ctx.from?.id, count: requests.length });
    } catch (error: any) {
      logger.error('Error listing pending requests', { error: error.message });
      await ctx.reply('❌ Ошибка при получении списка запросов.');
    }
  }

  async handleApprove(ctx: Context, userIdToApprove: number) {
    if (!this.authService.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    try {
      const request = this.authService.getAccessRequest(userIdToApprove);
      
      if (!request) {
        await ctx.reply('❌ Запрос не найден.');
        return;
      }

      if (request.status !== 'pending') {
        await ctx.reply(`❌ Запрос уже обработан (${request.status}).`);
        return;
      }

      const success = this.authService.approveUser(userIdToApprove, ctx.from!.id);

      if (success) {
        const userInfo = [
          request.firstName,
          request.lastName,
          request.username ? `@${request.username}` : null
        ].filter(Boolean).join(' ');

        await ctx.reply(
          `✅ <b>Доступ одобрен</b>\n\n` +
          `Пользователь: ${userInfo}\n` +
          `ID: <code>${userIdToApprove}</code>\n\n` +
          `Пользователь получил уведомление.`,
          { parse_mode: 'HTML' }
        );

        // Уведомляем пользователя
        try {
          await ctx.api.sendMessage(
            userIdToApprove,
            `🎉 <b>Ваш запрос одобрен!</b>\n\n` +
            `Теперь вы можете использовать команду /getconfig для получения конфигурации VPN.\n\n` +
            `Добро пожаловать!`,
            { parse_mode: 'HTML' }
          );
        } catch (error) {
          logger.error('Failed to notify approved user', { userId: userIdToApprove });
        }

        logger.info('User approved', { userId: userIdToApprove, adminId: ctx.from?.id });
      } else {
        await ctx.reply('❌ Не удалось одобрить пользователя.');
      }
    } catch (error: any) {
      logger.error('Error approving user', { error: error.message });
      await ctx.reply('❌ Произошла ошибка при одобрении.');
    }
  }

  async handleReject(ctx: Context, userIdToReject: number) {
    if (!this.authService.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    try {
      const request = this.authService.getAccessRequest(userIdToReject);
      
      if (!request) {
        await ctx.reply('❌ Запрос не найден.');
        return;
      }

      if (request.status !== 'pending') {
        await ctx.reply(`❌ Запрос уже обработан (${request.status}).`);
        return;
      }

      const success = this.authService.rejectUser(userIdToReject, ctx.from!.id);

      if (success) {
        const userInfo = [
          request.firstName,
          request.lastName,
          request.username ? `@${request.username}` : null
        ].filter(Boolean).join(' ');

        await ctx.reply(
          `❌ <b>Запрос отклонен</b>\n\n` +
          `Пользователь: ${userInfo}\n` +
          `ID: <code>${userIdToReject}</code>`,
          { parse_mode: 'HTML' }
        );

        // Уведомляем пользователя
        try {
          await ctx.api.sendMessage(
            userIdToReject,
            `❌ <b>Ваш запрос отклонен</b>\n\n` +
            `К сожалению, ваш запрос на доступ был отклонен администратором.\n` +
            `Если вы считаете это ошибкой, свяжитесь с администратором.`,
            { parse_mode: 'HTML' }
          );
        } catch (error) {
          logger.error('Failed to notify rejected user', { userId: userIdToReject });
        }

        logger.info('User rejected', { userId: userIdToReject, adminId: ctx.from?.id });
      } else {
        await ctx.reply('❌ Не удалось отклонить запрос.');
      }
    } catch (error: any) {
      logger.error('Error rejecting user', { error: error.message });
      await ctx.reply('❌ Произошла ошибка при отклонении.');
    }
  }

  async handleRevokeAccess(ctx: Context, userIdToRevoke: number) {
    if (!this.authService.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    try {
      const success = this.authService.revokeAccess(userIdToRevoke, ctx.from!.id);

      if (success) {
        await ctx.reply(
          `✅ Доступ отозван для пользователя <code>${userIdToRevoke}</code>`,
          { parse_mode: 'HTML' }
        );

        logger.info('Access revoked', { userId: userIdToRevoke, adminId: ctx.from?.id });
      } else {
        await ctx.reply('❌ Не удалось отозвать доступ.');
      }
    } catch (error: any) {
      logger.error('Error revoking access', { error: error.message });
      await ctx.reply('❌ Произошла ошибка при отзыве доступа.');
    }
  }

  async handleApprovedUsers(ctx: Context) {
    if (!this.authService.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    try {
      const users = this.authService.getApprovedUsers();

      if (users.length === 0) {
        await ctx.reply('📋 Нет одобренных пользователей.');
        return;
      }

      let message = `<b>✅ Одобренные пользователи (${users.length}):</b>\n\n`;

      for (const user of users) {
        const userInfo = user.username ? `@${user.username}` : `ID: ${user.user_id}`;
        const date = new Date(user.approved_at).toLocaleString('ru-RU');

        message += `👤 ${userInfo}\n`;
        message += `   Одобрен: ${date}\n`;
        message += `   /revoke_${user.user_id} - отозвать доступ\n\n`;
      }

      if (message.length > 4000) {
        const chunks = this.splitMessage(message, 4000);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: 'HTML' });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'HTML' });
      }

      logger.info('Approved users viewed', { adminId: ctx.from?.id, count: users.length });
    } catch (error: any) {
      logger.error('Error listing approved users', { error: error.message });
      await ctx.reply('❌ Ошибка при получении списка пользователей.');
    }
  }

  async handleAuthStats(ctx: Context) {
    if (!this.authService.isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ Эта команда доступна только администраторам.');
      return;
    }

    try {
      const stats = this.authService.getAuthStats();

      const modeNames = {
        open: '🌐 Открытый (любой может получить конфиг)',
        whitelist: '📋 Белый список (только разрешенные пользователи)',
        admin_approval: '✋ Одобрение админа (требуется запрос)',
        closed: '🔒 Закрытый (только админы)'
      };

      const message = `
<b>📊 Статистика авторизации</b>

<b>Режим:</b> ${modeNames[stats.authMode]}

<b>Запросы:</b>
• Всего: ${stats.totalRequests}
• На рассмотрении: ${stats.pendingRequests}

<b>Пользователи:</b>
• Одобренные: ${stats.approvedUsers}
• В белом списке: ${stats.whitelistUsers}

Используйте:
/pending - посмотреть запросы
/approved - список одобренных
      `.trim();

      await ctx.reply(message, { parse_mode: 'HTML' });

      logger.info('Auth stats viewed', { adminId: ctx.from?.id });
    } catch (error: any) {
      logger.error('Error getting auth stats', { error: error.message });
      await ctx.reply('❌ Ошибка при получении статистики.');
    }
  }

  private async notifyAdminsAboutRequest(ctx: Context, request: any) {
    const userInfo = [
      request.firstName,
      request.lastName,
      request.username ? `@${request.username}` : null
    ].filter(Boolean).join(' ');

    const message = `
🔔 <b>Новый запрос на доступ</b>

👤 <b>Пользователь:</b> ${userInfo}
🆔 <b>ID:</b> <code>${request.userId}</code>
📅 <b>Дата:</b> ${new Date(request.requestedAt).toLocaleString('ru-RU')}

<b>Действия:</b>
/approve_${request.userId} - одобрить
/reject_${request.userId} - отклонить
    `.trim();

    const adminIds = this.authService['adminIds'];
    
    for (const adminId of adminIds) {
      try {
        await ctx.api.sendMessage(adminId, message, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error('Failed to notify admin', { adminId, error });
      }
    }
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
