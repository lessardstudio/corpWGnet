import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/database.service';
import { WGDashboardClient } from '../services/wgdashboard.service';
import logger from '../utils/logger';

export function createLinksRouter(
  db: DatabaseService,
  wgClient: WGDashboardClient
): Router {
  const router = Router();

  // Создание новой share link
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { peerId, expiryHours = 24, maxUsage = 1, userId, createdBy } = req.body;

      if (!peerId) {
        return res.status(400).json({ error: 'peerId is required' });
      }

      // Проверяем, существует ли пир
      const peer = await wgClient.getPeerById(peerId);
      if (!peer) {
        return res.status(404).json({ error: 'Peer not found' });
      }

      const link = db.createShareLink(peerId, expiryHours, maxUsage, userId, createdBy);
      
      logger.info('Share link created', { 
        linkId: link.id, 
        peerId,
        userId,
        expiryHours 
      });

      res.status(201).json(link);
    } catch (error: any) {
      logger.error('Error creating share link', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Получение информации о link
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const link = db.getShareLink(id);

      if (!link) {
        return res.status(404).json({ error: 'Link not found' });
      }

      // Проверяем, истек ли срок действия
      if (Date.now() > link.expiresAt) {
        db.deactivateLink(id);
        return res.status(410).json({ error: 'Link expired' });
      }

      // Проверяем, не превышен ли лимит использования
      if (link.usageCount >= link.maxUsageCount) {
        db.deactivateLink(id);
        return res.status(410).json({ error: 'Usage limit exceeded' });
      }

      res.json(link);
    } catch (error: any) {
      logger.error('Error fetching share link', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Получение списка активных ссылок
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
      const links = db.getActiveLinks(userId);
      
      res.json(links);
    } catch (error: any) {
      logger.error('Error fetching active links', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Деактивация ссылки
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const success = db.deactivateLink(id);

      if (!success) {
        return res.status(404).json({ error: 'Link not found' });
      }

      logger.info('Share link deactivated', { linkId: id });
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error deactivating link', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
