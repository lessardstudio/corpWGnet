import { Bot } from 'grammy';
import { loadConfig } from './utils/config';
import logger from './utils/logger';
import { WGDashboardService } from './services/wgdashboard.service';
import { ServiceManagerClient } from './services/manager.service';
import { QRCodeGenerator } from './utils/qrcode';
import { AuthService } from './services/auth.service';
import { handleStart, handleHelp } from './handlers/start.handler';
import { ConfigHandler } from './handlers/config.handler';
import { AdminHandler } from './handlers/admin.handler';
import { AuthHandler } from './handlers/auth.handler';

async function main() {
  try {
    // Загружаем конфигурацию
    const config = loadConfig();
    logger.info('Configuration loaded successfully', {
      authMode: config.authMode,
      allowedUsers: config.allowedUserIds.length
    });

    // Создаем бота
    const bot = new Bot(config.telegramBotToken);
    logger.info('Bot instance created');

    // Инициализируем сервисы
    const wgService = new WGDashboardService(
      config.wgDashboardUrl,
      config.wgDashboardApiKey,
      config.wgConfigName
    );

    const managerService = new ServiceManagerClient(config.serviceManagerUrl);
    const qrGenerator = new QRCodeGenerator();
    
    // Инициализируем AuthService
    const dbPath = process.env.AUTH_DB_PATH || '/app/data/auth.sqlite';
    const authService = new AuthService(
      dbPath,
      config.authMode,
      config.adminIds,
      config.allowedUserIds
    );

    // Проверяем подключение к WGDashboard
    const isConnected = await wgService.handshake();
    if (!isConnected) {
      logger.error('Failed to connect to WGDashboard');
      process.exit(1);
    }
    logger.info('Successfully connected to WGDashboard');

    // Получаем информацию о боте
    const botInfo = await bot.api.getMe();

    // Инициализируем обработчики
    const configHandler = new ConfigHandler(wgService, managerService, qrGenerator, authService);
    const adminHandler = new AdminHandler(wgService, config.adminIds);
    const authHandler = new AuthHandler(authService, botInfo.username);

    // Middleware для логирования
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      const username = ctx.from?.username;
      const command = ctx.message?.text;
      
      logger.info('Received update', { userId, username, command });
      
      try {
        await next();
      } catch (error: any) {
        logger.error('Error processing update', { 
          error: error.message,
          userId,
          command 
        });
      }
    });

    // Обработчики команд - базовые
    bot.command('start', handleStart);
    bot.command('help', handleHelp);

    // Обработчики команд - получение конфига
    bot.command('getconfig', (ctx) => configHandler.handleGetConfig(ctx));

    // Обработчики команд - авторизация
    bot.command('request_access', (ctx) => authHandler.handleRequestAccess(ctx));
    bot.command('pending', (ctx) => authHandler.handlePendingRequests(ctx));
    bot.command('approved', (ctx) => authHandler.handleApprovedUsers(ctx));
    bot.command('authstats', (ctx) => authHandler.handleAuthStats(ctx));
    
    // Динамические команды для одобрения/отклонения
    bot.on('message:text', async (ctx, next) => {
      const text = ctx.message.text;
      
      if (text.startsWith('/approve_')) {
        const userId = parseInt(text.split('_')[1], 10);
        if (!isNaN(userId)) {
          await authHandler.handleApprove(ctx, userId);
          return;
        }
      }
      
      if (text.startsWith('/reject_')) {
        const userId = parseInt(text.split('_')[1], 10);
        if (!isNaN(userId)) {
          await authHandler.handleReject(ctx, userId);
          return;
        }
      }
      
      if (text.startsWith('/revoke_')) {
        const userId = parseInt(text.split('_')[1], 10);
        if (!isNaN(userId)) {
          await authHandler.handleRevokeAccess(ctx, userId);
          return;
        }
      }
      
      await next();
    });

    // Обработчики команд - администрирование
    bot.command('stats', (ctx) => adminHandler.handleStats(ctx));
    bot.command('list', (ctx) => adminHandler.handleListPeers(ctx));
    bot.command('delete', (ctx) => adminHandler.handleDeletePeer(ctx));
    bot.command('restrict', (ctx) => adminHandler.handleRestrictPeer(ctx));
    bot.command('admin', (ctx) => adminHandler.handleAdminHelp(ctx));

    // Обработчик неизвестных команд
    bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) {
        await ctx.reply(
          '❓ Неизвестная команда. Используйте /help для списка доступных команд.'
        );
      }
    });

    // Обработка ошибок
    bot.catch((err) => {
      const ctx = err.ctx;
      logger.error('Error in bot', { 
        error: err.error,
        userId: ctx.from?.id,
        update: ctx.update 
      });
    });

    // Запускаем бота
    logger.info('Starting bot...');
    await bot.start({
      onStart: (botInfo) => {
        logger.info('Bot started successfully', {
          username: botInfo.username,
          id: botInfo.id
        });
        console.log(`
╔═══════════════════════════════════════╗
║  🤖 WireGuard Telegram Bot Started   ║
╚═══════════════════════════════════════╝
        
Bot: @${botInfo.username}
ID: ${botInfo.id}
Admins: ${config.adminIds.join(', ')}

Bot is ready to accept commands!
        `);
      }
    });

    // Обработка сигналов завершения
    process.once('SIGINT', () => {
      logger.info('Received SIGINT, stopping bot...');
      bot.stop();
    });
    
    process.once('SIGTERM', () => {
      logger.info('Received SIGTERM, stopping bot...');
      bot.stop();
    });

  } catch (error: any) {
    logger.error('Fatal error during bot initialization', { 
      error: error.message,
      stack: error.stack 
    });
    process.exit(1);
  }
}

// Запускаем бота
main();
