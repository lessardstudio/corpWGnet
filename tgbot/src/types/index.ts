export interface Config {
  telegramBotToken: string;
  adminIds: number[];
  serviceManagerUrl: string;
  wgDashboardUrl: string;
  wgDashboardApiKey: string;
  wgConfigName: string;
  authMode: 'open' | 'whitelist' | 'admin_approval' | 'closed';
  allowedUserIds: number[];
}

export interface WireGuardPeer {
  id: string;
  name: string;
  publicKey: string;
  allowedIPs: string[];
  endpoint?: string;
  persistentKeepalive?: number;
  config: string;
}

export interface ShareLink {
  id: string;
  url: string;
  peerId: string;
  expiresAt: Date;
  usageCount: number;
  maxUsageCount: number;
  isActive: boolean;
}

export interface UserSession {
  userId: number;
  username?: string;
  currentAction?: string;
  data?: any;
}

export interface BotContext {
  update: any;
  session: UserSession;
}

export interface AccessRequest {
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: number;
  reviewedAt?: number;
}
