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
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { peerId, expiryHours = 24, maxUsage = 1, userId, createdBy } = req.body;

      if (!peerId) {
        res.status(400).json({ error: 'peerId is required' });
        return;
      }

      // Проверяем, существует ли пир
      const peer = await wgClient.getPeerById(peerId);
      if (!peer) {
        res.status(404).json({ error: 'Peer not found' });
        return;
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
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const link = db.getShareLink(id);

      if (!link) {
        res.status(404).json({ error: 'Link not found' });
        return;
      }

      // Проверяем, истек ли срок действия
      if (Date.now() > link.expiresAt) {
        db.deactivateLink(id);
        res.status(410).json({ error: 'Link expired' });
        return;
      }

      // Проверяем, не превышен ли лимит использования
      if (link.usageCount >= link.maxUsageCount) {
        db.deactivateLink(id);
        res.status(410).json({ error: 'Usage limit exceeded' });
        return;
      }

      res.json(link);
    } catch (error: any) {
      logger.error('Error fetching share link', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Получение списка активных ссылок
  router.get('/', async (req: Request, res: Response): Promise<void> => {
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
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const success = db.deactivateLink(id);

      if (!success) {
        res.status(404).json({ error: 'Link not found' });
        return;
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
