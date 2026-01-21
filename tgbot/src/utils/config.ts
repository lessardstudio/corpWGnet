import dotenv from 'dotenv';
import { Config } from '../types';
import logger from './logger';

dotenv.config();

// Safe process.env access helper
const getEnv = (key: string): string | undefined => {
  return (globalThis as any).process?.env?.[key];
};

export const loadConfig = (): Config => {
  logger.info('Starting configuration loading...');

  const required = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ADMIN_IDS',
    'WGDASHBOARD_URL',
    'WGDASHBOARD_API_KEY',
    'WGDASHBOARD_CONFIG_NAME'
  ];

  const missing = required.filter(key => !getEnv(key));
  
  if (missing.length > 0) {
    const errorMsg = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const authModeRaw = getEnv('AUTH_MODE');
  const authMode = (authModeRaw || 'open') as 'open' | 'whitelist' | 'admin_approval' | 'closed';
  
  const allowedUserIdsRaw = getEnv('ALLOWED_USER_IDS');
  const allowedUserIds = allowedUserIdsRaw
    ? allowedUserIdsRaw.split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id))
    : [];

  const adminIdsRaw = getEnv('TELEGRAM_ADMIN_IDS')!;
  const adminIds = adminIdsRaw
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => !isNaN(id));

  const config: Config = {
    telegramBotToken: getEnv('TELEGRAM_BOT_TOKEN')!,
    adminIds,
    serviceManagerUrl: (getEnv('SERVICE_MANAGER_URL') || 'http://service-manager:3000').trim(),
    wgDashboardUrl: getEnv('WGDASHBOARD_URL')!.trim(),
    wgDashboardApiKey: getEnv('WGDASHBOARD_API_KEY')!.trim(),
    wgConfigName: getEnv('WGDASHBOARD_CONFIG_NAME')!.trim(),
    authMode,
    allowedUserIds
  };

  logger.info('Configuration loaded successfully', {
    authMode: config.authMode,
    adminCount: config.adminIds.length,
    allowedUsersCount: config.allowedUserIds.length,
    wgConfigName: config.wgConfigName,
    wgDashboardUrl: config.wgDashboardUrl,
    serviceManagerUrl: config.serviceManagerUrl
  });

  return config;
};
