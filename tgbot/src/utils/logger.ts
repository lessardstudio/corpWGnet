import winston from 'winston';
import path from 'path';

// Safe process.env access helper
const getEnv = (key: string): string | undefined => {
  return (globalThis as any).process?.env?.[key];
};

const logDir = getEnv('LOG_DIR') || '/app/logs';

export const logger = winston.createLogger({
  level: getEnv('LOG_LEVEL') || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'wg-tgbot' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log') 
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `[${timestamp}] [${service}] ${level}: ${message} ${metaStr}`;
        })
      )
    })
  ]
});

export default logger;
