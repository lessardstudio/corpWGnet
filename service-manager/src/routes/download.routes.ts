import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/database.service';
import { WGDashboardClient } from '../services/wgdashboard.service';
import logger from '../utils/logger';

export function createDownloadRouter(
  db: DatabaseService,
  wgClient: WGDashboardClient
): Router {
  const router = Router();

  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const link = db.getShareLink(id);

      if (!link || !link.isActive) {
        res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Ссылка не найдена</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <h1>❌ Ссылка не найдена</h1>
            <p>Эта ссылка недействительна или была деактивирована.</p>
          </body>
          </html>
        `);
        return;
      }

      // Проверяем срок действия
      if (Date.now() > link.expiresAt) {
        db.deactivateLink(id);
        res.status(410).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Ссылка истекла</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #f39c12; }
            </style>
          </head>
          <body>
            <h1>⏰ Срок действия ссылки истек</h1>
            <p>Запросите новую ссылку у администратора.</p>
          </body>
          </html>
        `);
        return;
      }

      // Проверяем лимит использования
      if (link.usageCount >= link.maxUsageCount) {
        db.deactivateLink(id);
        res.status(410).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Лимит исчерпан</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #f39c12; }
            </style>
          </head>
          <body>
            <h1>🚫 Лимит использования исчерпан</h1>
            <p>Эта ссылка уже была использована максимальное количество раз.</p>
          </body>
          </html>
        `);
        return;
      }

      // Получаем конфигурацию
      const config = await wgClient.getPeerConfig(link.peerId);

      if (!config) {
        logger.error('Failed to fetch peer config', { peerId: link.peerId });
        res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Ошибка</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <h1>❌ Ошибка получения конфигурации</h1>
            <p>Попробуйте позже или свяжитесь с администратором.</p>
          </body>
          </html>
        `);
        return;
      }

      // Логируем использование
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');
      db.logUsage(id, ipAddress, userAgent);

      // Увеличиваем счетчик использования
      db.incrementUsage(id);

      logger.info('Config downloaded', {
        linkId: id,
        peerId: link.peerId,
        ipAddress,
        usageCount: link.usageCount + 1
      });

      // Отправляем файл
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="wireguard-${link.peerId.slice(0, 8)}.conf"`);
      res.send(config);

    } catch (error: any) {
      logger.error('Error in download handler', { error: error.message });
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Ошибка сервера</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1>❌ Ошибка сервера</h1>
          <p>Произошла внутренняя ошибка. Попробуйте позже.</p>
        </body>
        </html>
      `);
    }
  });

  return router;
}
