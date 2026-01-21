import dotenv from 'dotenv';
import { Config } from '../types';

dotenv.config();

export const loadConfig = (): Config => {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ADMIN_IDS',
    'WGDASHBOARD_URL',
    'WGDASHBOARD_API_KEY',
    'WGDASHBOARD_CONFIG_NAME'
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const authMode = (process.env.AUTH_MODE || 'open') as 'open' | 'whitelist' | 'admin_approval' | 'closed';
  const allowedUserIds = process.env.ALLOWED_USER_IDS
    ? process.env.ALLOWED_USER_IDS.split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id))
    : [];

  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
    adminIds: process.env.TELEGRAM_ADMIN_IDS!
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id)),
    serviceManagerUrl: process.env.SERVICE_MANAGER_URL || 'http://service-manager:3000',
    wgDashboardUrl: process.env.WGDASHBOARD_URL!,
    wgDashboardApiKey: process.env.WGDASHBOARD_API_KEY!,
    wgConfigName: process.env.WGDASHBOARD_CONFIG_NAME!,
    authMode,
    allowedUserIds
  };
};
