import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { DatabaseService } from './services/database.service';
import { WGDashboardClient } from './services/wgdashboard.service';
import { createLinksRouter } from './routes/links.routes';
import { createDownloadRouter } from './routes/download.routes';
import logger from './utils/logger';

dotenv.config();

const PORT = parseInt(process.env.SERVICE_MANAGER_PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || '/app/data/database.sqlite';

// Инициализация сервисов
const db = new DatabaseService(DB_PATH);
const wgClient = new WGDashboardClient(
  process.env.WGDASHBOARD_URL || 'http://wgdashboard:10086',
  process.env.WGDASHBOARD_API_KEY || '',
  process.env.WGDASHBOARD_CONFIG_NAME || 'wg0'
);

const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Логирование запросов
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'wg-service-manager'
  });
});

// API Routes
app.use('/api/links', createLinksRouter(db, wgClient));

// Download Routes
app.use('/download', createDownloadRouter(db, wgClient));

// Root route
app.get('/', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WireGuard Service Manager</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #2c3e50;
          border-bottom: 3px solid #3498db;
          padding-bottom: 10px;
        }
        .endpoints {
          background: #ecf0f1;
          padding: 20px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .endpoint {
          margin: 10px 0;
          font-family: monospace;
          color: #27ae60;
        }
        .status {
          display: inline-block;
          padding: 5px 15px;
          background: #27ae60;
          color: white;
          border-radius: 20px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 WireGuard Service Manager</h1>
        <p><span class="status">✓ Online</span></p>
        
        <h2>API Endpoints:</h2>
        <div class="endpoints">
          <div class="endpoint">POST /api/links - Create share link</div>
          <div class="endpoint">GET /api/links - List active links</div>
          <div class="endpoint">GET /api/links/:id - Get link info</div>
          <div class="endpoint">DELETE /api/links/:id - Deactivate link</div>
          <div class="endpoint">GET /download/:id - Download config</div>
        </div>

        <h2>Status:</h2>
        <p>Service is running and ready to accept requests.</p>
        
        <p style="color: #7f8c8d; font-size: 12px; margin-top: 40px;">
          WireGuard Service Manager v1.0.0
        </p>
      </div>
    </body>
    </html>
  `);
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { 
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  
  res.status(500).json({ error: 'Internal server error' });
});

// Cleanup task - запускается каждый час
setInterval(() => {
  const cleaned = db.cleanupExpiredLinks();
  if (cleaned > 0) {
    logger.info('Cleaned up expired links', { count: cleaned });
  }
}, 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  db.close();
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info('Service manager started', { port: PORT });
  console.log(`
╔═══════════════════════════════════════╗
║  🔧 WireGuard Service Manager         ║
╚═══════════════════════════════════════╝

Server listening on port ${PORT}
Database: ${DB_PATH}

API Endpoints:
  POST   /api/links
  GET    /api/links
  GET    /api/links/:id
  DELETE /api/links/:id
  GET    /download/:id

Health check: http://localhost:${PORT}/health
  `);
});

export default app;
