import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ShareLink {
  id: string;
  peerId: string;
  url: string;
  createdAt: number;
  expiresAt: number;
  usageCount: number;
  maxUsageCount: number;
  isActive: number; // SQLite doesn't have boolean, use 0/1
  userId?: number;
  createdBy?: string;
}

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    
    this.initializeTables();
  }

  private initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS share_links (
        id TEXT PRIMARY KEY,
        peer_id TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        usage_count INTEGER DEFAULT 0,
        max_usage_count INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        user_id INTEGER,
        created_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_share_links_peer_id ON share_links(peer_id);
      CREATE INDEX IF NOT EXISTS idx_share_links_is_active ON share_links(is_active);
      CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON share_links(expires_at);

      CREATE TABLE IF NOT EXISTS usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        accessed_at INTEGER NOT NULL,
        FOREIGN KEY (link_id) REFERENCES share_links(id)
      );

      CREATE INDEX IF NOT EXISTS idx_usage_logs_link_id ON usage_logs(link_id);
    `);
  }

  createShareLink(
    peerId: string,
    expiryHours: number,
    maxUsage: number = 1,
    userId?: number,
    createdBy?: string
  ): ShareLink {
    const id = uuidv4();
    const now = Date.now();
    const expiresAt = now + expiryHours * 60 * 60 * 1000;
    const linkDomain = process.env.LINK_DOMAIN || 'http://localhost:3000';
    const url = `${linkDomain}/download/${id}`;

    const stmt = this.db.prepare(`
      INSERT INTO share_links (
        id, peer_id, url, created_at, expires_at, 
        max_usage_count, user_id, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, peerId, url, now, expiresAt, maxUsage, userId, createdBy);

    return {
      id,
      peerId,
      url,
      createdAt: now,
      expiresAt,
      usageCount: 0,
      maxUsageCount: maxUsage,
      isActive: 1,
      userId,
      createdBy
    };
  }

  getShareLink(id: string): ShareLink | null {
    const stmt = this.db.prepare('SELECT * FROM share_links WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;

    return {
      id: row.id,
      peerId: row.peer_id,
      url: row.url,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usageCount: row.usage_count,
      maxUsageCount: row.max_usage_count,
      isActive: row.is_active,
      userId: row.user_id,
      createdBy: row.created_by
    };
  }

  incrementUsage(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE share_links 
      SET usage_count = usage_count + 1 
      WHERE id = ?
    `);
    
    const result = stmt.run(id);
    return result.changes > 0;
  }

  deactivateLink(id: string): boolean {
    const stmt = this.db.prepare('UPDATE share_links SET is_active = 0 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getActiveLinks(userId?: number): ShareLink[] {
    let stmt;
    let rows;

    if (userId) {
      stmt = this.db.prepare(`
        SELECT * FROM share_links 
        WHERE is_active = 1 AND user_id = ?
        ORDER BY created_at DESC
      `);
      rows = stmt.all(userId);
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM share_links 
        WHERE is_active = 1
        ORDER BY created_at DESC
      `);
      rows = stmt.all();
    }

    return (rows as any[]).map(row => ({
      id: row.id,
      peerId: row.peer_id,
      url: row.url,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usageCount: row.usage_count,
      maxUsageCount: row.max_usage_count,
      isActive: row.is_active,
      userId: row.user_id,
      createdBy: row.created_by
    }));
  }

  logUsage(linkId: string, ipAddress?: string, userAgent?: string) {
    const stmt = this.db.prepare(`
      INSERT INTO usage_logs (link_id, ip_address, user_agent, accessed_at)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(linkId, ipAddress, userAgent, Date.now());
  }

  cleanupExpiredLinks(): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE share_links 
      SET is_active = 0 
      WHERE is_active = 1 AND expires_at < ?
    `);
    
    const result = stmt.run(now);
    return result.changes;
  }

  close() {
    this.db.close();
  }
}
