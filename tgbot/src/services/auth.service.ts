import Database from 'better-sqlite3';
import path from 'path';
import { AccessRequest } from '../types';
import logger from '../utils/logger';

export class AuthService {
  private db: Database.Database;
  private authMode: 'open' | 'whitelist' | 'admin_approval' | 'closed';
  private adminIds: number[];
  private allowedUserIds: number[];

  constructor(
    dbPath: string,
    authMode: 'open' | 'whitelist' | 'admin_approval' | 'closed',
    adminIds: number[],
    allowedUserIds: number[]
  ) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.authMode = authMode;
    this.adminIds = adminIds;
    this.allowedUserIds = allowedUserIds;
    
    this.initializeTables();
    logger.info('Auth service initialized', { authMode, adminCount: adminIds.length });
  }

  private initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS access_requests (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        requested_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        reviewed_by INTEGER,
        reviewed_at INTEGER,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS approved_users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        approved_by INTEGER NOT NULL,
        approved_at INTEGER NOT NULL,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
      CREATE INDEX IF NOT EXISTS idx_approved_users_approved_at ON approved_users(approved_at);
    `);
  }

  isAdmin(userId: number): boolean {
    return this.adminIds.includes(userId);
  }

  canGetConfig(userId: number): boolean {
    // Админы всегда могут получать конфиги
    if (this.isAdmin(userId)) {
      return true;
    }

    switch (this.authMode) {
      case 'open':
        return true;

      case 'whitelist':
        return this.allowedUserIds.includes(userId) || this.isUserApproved(userId);

      case 'admin_approval':
        return this.isUserApproved(userId);

      case 'closed':
        return false;

      default:
        return false;
    }
  }

  isUserApproved(userId: number): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM approved_users WHERE user_id = ?');
    const result = stmt.get(userId);
    return !!result;
  }

  requestAccess(
    userId: number,
    username?: string,
    firstName?: string,
    lastName?: string
  ): AccessRequest {
    const existing = this.getAccessRequest(userId);
    
    if (existing) {
      if (existing.status === 'approved') {
        throw new Error('User already approved');
      }
      if (existing.status === 'pending') {
        throw new Error('Access request already pending');
      }
      // Если был rejected, позволяем создать новый запрос
    }

    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO access_requests 
      (user_id, username, first_name, last_name, requested_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);
    
    stmt.run(userId, username, firstName, lastName, now);
    
    logger.info('Access request created', { userId, username });

    return {
      userId,
      username,
      firstName,
      lastName,
      requestedAt: now,
      status: 'pending'
    };
  }

  getAccessRequest(userId: number): AccessRequest | null {
    const stmt = this.db.prepare('SELECT * FROM access_requests WHERE user_id = ?');
    const row = stmt.get(userId) as any;
    
    if (!row) return null;

    return {
      userId: row.user_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      requestedAt: row.requested_at,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at
    };
  }

  getPendingRequests(): AccessRequest[] {
    const stmt = this.db.prepare(`
      SELECT * FROM access_requests 
      WHERE status = 'pending' 
      ORDER BY requested_at ASC
    `);
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      requestedAt: row.requested_at,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at
    }));
  }

  approveUser(userId: number, adminId: number, notes?: string): boolean {
    const now = Date.now();
    
    try {
      // Обновляем статус запроса
      const updateRequest = this.db.prepare(`
        UPDATE access_requests 
        SET status = 'approved', reviewed_by = ?, reviewed_at = ?, notes = ?
        WHERE user_id = ?
      `);
      updateRequest.run(adminId, now, notes, userId);

      // Добавляем в approved_users
      const request = this.getAccessRequest(userId);
      const insertApproved = this.db.prepare(`
        INSERT OR REPLACE INTO approved_users 
        (user_id, username, approved_by, approved_at, notes)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertApproved.run(userId, request?.username, adminId, now, notes);

      logger.info('User approved', { userId, adminId });
      return true;
    } catch (error: any) {
      logger.error('Error approving user', { error: error.message, userId });
      return false;
    }
  }

  rejectUser(userId: number, adminId: number, notes?: string): boolean {
    const now = Date.now();
    
    try {
      const stmt = this.db.prepare(`
        UPDATE access_requests 
        SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, notes = ?
        WHERE user_id = ?
      `);
      stmt.run(adminId, now, notes, userId);

      logger.info('User rejected', { userId, adminId });
      return true;
    } catch (error: any) {
      logger.error('Error rejecting user', { error: error.message, userId });
      return false;
    }
  }

  revokeAccess(userId: number, adminId: number): boolean {
    try {
      // Удаляем из approved_users
      const deleteApproved = this.db.prepare('DELETE FROM approved_users WHERE user_id = ?');
      deleteApproved.run(userId);

      // Обновляем статус запроса
      const updateRequest = this.db.prepare(`
        UPDATE access_requests 
        SET status = 'rejected', reviewed_by = ?, reviewed_at = ?
        WHERE user_id = ?
      `);
      updateRequest.run(adminId, Date.now(), userId);

      logger.info('Access revoked', { userId, adminId });
      return true;
    } catch (error: any) {
      logger.error('Error revoking access', { error: error.message, userId });
      return false;
    }
  }

  getApprovedUsers(): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM approved_users 
      ORDER BY approved_at DESC
    `);
    return stmt.all();
  }

  getAuthStats(): any {
    const totalRequests = this.db.prepare('SELECT COUNT(*) as count FROM access_requests').get() as any;
    const pendingRequests = this.db.prepare('SELECT COUNT(*) as count FROM access_requests WHERE status = "pending"').get() as any;
    const approvedUsers = this.db.prepare('SELECT COUNT(*) as count FROM approved_users').get() as any;
    
    return {
      authMode: this.authMode,
      totalRequests: totalRequests.count,
      pendingRequests: pendingRequests.count,
      approvedUsers: approvedUsers.count,
      whitelistUsers: this.allowedUserIds.length
    };
  }

  close() {
    this.db.close();
  }
}
